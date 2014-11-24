#NewRelic Buster
A monkey patch to allow New Relic to run on Kraken Apps without messing up the routing.

##The problem
New Relic is like the facehuggers from alien. Once it grabs a hold of your code, it don't let go.

![FaceHugger](http://img0.joyreactor.com/pics/post/auto-Alien-love-girl-347047.jpeg)

In order to instrument an Express app, it needs to inject itself into all middleware stacks, after middleware, and before error handlers.
To do this, it patches several methods in express, allowing it to hijack calls that modify the middleware stack.

In our particular case, we're focusing on Routing. Routes in express are treated as middleware, so, NewRelic tries to get in on the action.
Because it needs to be as close to the end of the stack as possible, whenever a new route is added, it will remove the interceptor from the stack, add the new route, and then add the interceptor after it.

The problem lies in the removal step.

To remove they use `Array.filter`. 
`node_modules/newrelic/lib/instrumentation/express.js:404`  (Ironic Line number is Ironic...)
```javascript

// Remove our custom error handler.

         app.stack = app.stack.filter(function cb_filter(m) {
         if(m === interceptor){
         console.log();
         }
         return m !== interceptor}.bind(app))
```
         
Pretty elegant. However, `Array.filter` returns a **new** Array. This kills some in-memory references that Kraken uses to maintain it's route stack.
 
This patch works it's way down NewRelic's code to modify the above function to use `Array.splice` instead, using the same clever tricks as NewRelic.

```javascript
 
         var i = app.stack.length -1;
         for (;i>0;i--){
             if(app.stack[i]===interceptor) {
                 app.stack.splice(i,1);
             }
         }
```         
 
##Usage
 Simply require this **before** newrelic gets loaded
 
```javascript

'use strict';
require('newrelicbuster')
require('newrelic');
var http = require('http');
var express = require('express');
var kraken = require('kraken-js');
```
 
  
##Caveat Emptor

Hey, this is just a Sunday afternoon patch! 
Feel free to contribute as you see fit, but in reality you should go bother New Relic to fix their code.

### Not an official Kraken / PayPal / New Relic project.
 
Go say hello on the [birdsphere](https://twitter.com/LennyMarkus)
 
