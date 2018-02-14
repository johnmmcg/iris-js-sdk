// Copyright 2018 Comcast Cable Communications Management, LLC

// IrisRtcSdk.js : Importing all the modules to global object

// Import the connection module
var IrisRtcConnection = require('./IrisRtcConnection.js');
global.IrisRtcConnection = IrisRtcConnection;

// Import the session module
var IrisRtcSession = require('./IrisRtcSession.js');
global.IrisRtcSession = IrisRtcSession;

// Import stream module
var IrisRtcStream = require('./IrisRtcStream');
global.IrisRtcStream = IrisRtcStream;

// Import the error
var IrisRtcErrors = require('./modules/RtcErrors.js');
global.IrisRtcErrors = IrisRtcErrors;

// Import the logger
var IrisRtcLogger = require('./modules/RtcLogger.js');
global.IrisRtcLogger = IrisRtcLogger;

// Import the config
var IrisRtcConfig = require('./modules/RtcConfig.js');
global.IrisRtcConfig = IrisRtcConfig;
