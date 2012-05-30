// Copyright 2012 Mark Cavage.  All rights reserved.

var util = require('util');



///--- Globals

var sprintf = util.format;



///--- Messages

var ARG_REQUIRED = '%s is required';
var ARRAY_TYPE_REQUIRED = '%s ([%s]) required';
var TYPE_REQUIRED = '%s is required';



///--- API

function assertArgument(name, type, arg) {
        if (arg === undefined)
                throw new Error(sprintf(ARG_REQUIRED, name));


        if (typeof (arg) !== type)
                throw new TypeError(sprintf(TYPE_REQUIRED, name, type));


        return (true);
}


function assertArray(name, type, arr) {
        var ok = true;

        if (!Array.isArray(arr))
                throw new TypeError(sprintf(ARRAY_TYPE_REQUIRED, name, type));

        for (var i = 0; i < arr.length; i++) {
                if (typeof (arr[i]) !== type) {
                        ok = false;
                        break;
                }
        }

        if (!ok)
                throw new TypeError(sprintf(ARRAY_TYPE_REQUIRED, name, type));

}


function assertBoolean(name, arg) {
        assertArgument(name, 'boolean', arg);
}


function assertFunction(name, arg) {
        assertArgument(name, 'function', arg);
}


function assertNumber(name, arg) {
        assertArgument(name, 'number', arg);
}


function assertObject(name, arg) {
        assertArgument(name, 'object', arg);
}


function assertString(name, arg) {
        assertArgument(name, 'string', arg);
}



///--- Exports

module.exports = {

        assertArgument: assertArgument,
        assertArray: assertArray,
        assertBoolean: assertBoolean,
        assertFunction: assertFunction,
        assertNumber: assertNumber,
        assertObject: assertObject,
        assertString: assertString

};
