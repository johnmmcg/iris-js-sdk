// Copyright 2018 Comcast Cable Communications Management, LLC

// RtcLogger.js : Javascript code for storing the logs

// Defining the API module  
var RtcLogger = module.exports;

// Import the modules
var config = require('./RtcConfig.js');

// Logger levels 
RtcLogger.level = {
    ERROR: 0,
    WARNING: 1,
    INFO: 2,
    VERBOSE: 3
};

// Logger levels
RtcLogger.currentLevel = config.json.logLevel;

/**
 * Logger utillity 
 * @param {int} level - Logger level as defined in RtcLogger.level
 * @param {string} module - Module for tagging
 * @param {string} text - logging text
 */
RtcLogger.log = function log(level, module, text, obj) {
    var self = this;
    // Set the updated log level
    RtcLogger.currentLevel = config.json.logLevel;

    // Check if the log is filtered
    if (RtcLogger.currentLevel >= level) {

        if (level == RtcLogger.level.ERROR) {
            // Currently all the logs are directly to console
            console.error("\n" + getDate() + " :: " + module + " :: " + text + " ", obj ? obj : "");
        } else if (level == RtcLogger.level.WARNING) {
            // Currently all the logs are directly to console
            console.warn("\n" + getDate() + " :: " + module + " :: " + text + " ", obj ? obj : "");
        } else {
            // Currently all the logs are directly to console
            console.log("\n" + getDate() + " :: " + module + " :: " + text + " ", obj ? obj : "");
        }
        self.onSDKLog(getDate() + " :: " + module + " :: " + text + " ", obj ? obj : "");
    }
};

RtcLogger.trace = function(module, text, obj) {
    this.print(RtcLogger.level.WARNING, module, text, obj);
}

RtcLogger.warn = function(module, text, obj) {
    this.print(RtcLogger.level.WARNING, module, text, obj);
}

RtcLogger.info = function(module, text, obj) {
    this.print(RtcLogger.level.INFO, module, text, obj);
}

RtcLogger.error = function(module, text, obj) {
    this.print(RtcLogger.level.ERROR, module, text, obj);
}

/**
 * @private
 */
RtcLogger.print = function(level, module, text, obj) {
    var self = this;

    RtcLogger.currentLevel = config.json.logLevel;

    if (config.json.logLevel >= level) {

        // Send log to client 
        self.onSDKLog("\n" + getDate() + " :: " + module + " :: " + text + " ", obj ? obj : "");

        if (level == RtcLogger.level.ERROR) {
            console.error("\n" + getDate() + " :: " + module + " :: " + text + " ", obj ? obj : "");

        } else if (level == RtcLogger.level.WARNING) {
            console.warn("\n" + getDate() + " :: " + module + " :: " + text + " ", obj ? obj : "");

        } else if (level == RtcLogger.level.INFO) {
            console.info("\n" + getDate() + " :: " + module + " :: " + text + " ", obj ? obj : "");

        } else if (level == RtcLogger.level.VERBOSE) {
            console.log("\n" + getDate() + " :: " + module + " :: " + text + " ", obj ? obj : "");
        }
    }
}

/**
 * Returns the date in the format : 1/1/2017 xx:xx:xx.xxx 
 * @private
 */
function getDate() {
    return (new Date().toLocaleDateString() + " " +
        new Date().toLocaleTimeString('en-US', { hour12: false, hour: "numeric", minute: "numeric", second: "numeric" }) + "." +
        new Date().getMilliseconds());
}

/**
 * API to listen to SDK logs  
 * @private
 */
RtcLogger.onSDKLog = function() {

}
