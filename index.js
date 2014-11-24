/**
 * Created by lmarkus on 11/23/14.
 */
var express= require('express');
var patchedExpress = require('./patchedExpress');
var Module = require('module');
var original = Module._load;

//Patch #1: The module loader, just like NewRelic does.
Module._load = function buster(file) {

    //Keep a lookout for NewRelics Shimmer module so we can patch it.
    if (typeof file === 'string' && file.indexOf('/instrumentation/express.js') >= 0) {

        var nrExpress = original.apply(this, arguments);
        for(var i = 0 ; i < arguments.length;i++){
            console.log(arguments[i]);
        }

        arguments[0]='./patchedExpress.js';
        var patch = original.apply(this,arguments);
        return patch;
    }
    else {
        return original.apply(this, arguments)
    }
}

//Gorilla patch!

/**
 * New Relic created a new array every time they removed the interceptor.
 * The following code just splices the same array in place.
 * @param app
 */
var interceptor;
var ORIGINAL = '__NR_original'
var RESERVED = [ // http://es5.github.io/#x7.6.1.2
                 // always (how would these even get here?)
    'class', 'enum', 'extends', 'super', 'const', 'export', 'import',
    // strict
    'implements', 'let', 'private', 'public', 'yield', 'interface',
    'package', 'protected', 'static'
]


var removeInterceptor = function removeInterceptor(app) {
    if (app.stack && app.stack.length) {
        // Remove our custom error handler.

        var i = app.stack.length -1;
        for (;i>0;i--){
            if(app.stack[i]===interceptor) {
                app.stack.splice(i,1);
            }
        }
    }

}

/*
 The following functions are lifted straight from NewRelic's code. I needed the whole chain for patching.

 */

// This is the error handler we inject for express4. Yanked from connect support.
var sentinel = function sentinel(error, req, res, next) {
    if (error) {
        /*
        var transaction = agent.tracer.getTransaction()
        if (transaction) {
            transaction.exceptions.push(error)
        }
        else {
            agent.errors.add(null, error)
        }*/
    }

    return next(error)
}
var addInterceptor = function addInterceptor(app) {
    /* Give the error tracer a better chance of intercepting errors by
     * putting it before the first error handler (a middleware that takes 4
     * parameters, in express's world). Error handlers tend to be placed
     * towards the end of the middleware chain and sometimes don't pass
     * errors along. Don't just put the interceptor at the beginning because
     * we want to allow as many middleware functions to execute as possible
     * before the interceptor is run, to increase error coverage.
     *
     * NOTE: This is heuristic, and works because interceptor propagates
     *       errors instead of terminating the middleware chain.
     *       Ignores routes.
     */
    var spliced = false
    for (var i = 0; i < app.stack.length; i++) {
        var middleware = app.stack[i]
        // Check to see if it is an error handler middleware
        if (middleware &&
            middleware.handle &&
            middleware.handle.length === 4) {
            app.stack.splice(i, 0, interceptor)
            spliced = true
            break
        }
    }
    if (!spliced) app.stack.push(interceptor)
}

var mangle = function mangle(name) {
    if (RESERVED.indexOf(name) !== -1) return name + '_'

    return name
}
var wrapHandle = function wrapHandle(__NR_handle, path) {
    var name = ''
    var arglist


    // reiterated: testing function arity is stupid
    switch (__NR_handle.length) {
        case 2:
            arglist = '(req, res)'
            break

        case 3:
            arglist = '(req, res, next)'
            break

        // don't break other error handlers
        case 4:
            arglist = '(err, req, res, next)'
            break

        default:
            arglist = '()'
    }

    if (__NR_handle.name) name = mangle(__NR_handle.name)

    var template = function () {
        var args = tracer.slice(arguments)
            , last = args.length - 1


        if (typeof args[last] === 'function') {
            args[last] = tracer.callbackProxy(args[last])
        }

        __NR_handle.apply(this, args)
    }

    var routerTemplate = function () {
        return wrappedHandle.call(this, path, template, [].slice.call(arguments))
    }

    var handlerTemplate = Object.getPrototypeOf(__NR_handle) === express.Router ?
        routerTemplate :
        template

    // I am a bad person and this makes me feel bad.
    // We use eval because we need to insert the function with a specific name to allow for lookups.
    // jshint evil:true
    var wrapped = eval(
        '(function(){return function ' + name + arglist +
        handlerTemplate.toString().substring(11) + '}())'
    )
    wrapped[ORIGINAL] = __NR_handle
    // jshint evil:false

    return wrapped
}

var pw = function patchedWrapMiddlewareStack(route, use) {

    return function cls_wrapMiddlewareStack() {
        // Remove our custom error handler.
        removeInterceptor(this)

        /* We allow `use` to go through the arguments so it can reject bad things
         * for us so we don't have to also do argument type checking.
         */
        var app = use.apply(this, arguments)
        var path = typeof arguments[0] === 'string' ? arguments[0] : '/'

        /* Express adds routes to the same stack as middlewares. We need to wrap
         * that adder too but we only want to wrap the middlewares that are
         * added, not the Router.
         */
        if (!route) {
            // wrap most recently added unwrapped handler
            var i = this.stack.length
            var top
            while (top = this.stack[--i]) {
                if (!top.handle || typeof top.handle !== 'function' || top.handle[ORIGINAL]) {
                    break
                }

                top.handle = wrapHandle(top.handle, path)
            }
        }

        if (!interceptor) {
            // call use to create a Layer object, then pop it off and store it.
            use.call(this, '/', sentinel)
            interceptor = this.stack.pop()
        }

        addInterceptor(this)

        return app
    }


}


module.exports = function() {
    //TODO remove patch, maybe?

};
