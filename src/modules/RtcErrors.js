// Copyright 2018 Comcast Cable Communications Management, LLC

// RtcErrors.js : Javascript code for errors

// Defining the API module  
var RtcErrors = module.exports;

// Error codes  
RtcErrors.code = {
    ERR_INCORRECT_PARAMETERS: -101,
    ERR_NOT_SUPPORTED: -102,
    ERR_INVALID_STATE: -103,
    ERR_NOT_CONNECTED: -104,
    ERR_JOIN_ROOM_FAILED: -104,
    ERR_BACKEND_ERROR: -105,

    ERR_CREATE_CONNECTION_FAILED: -106,
    ERR_CREATE_SESSION_FAILED: -107,
    ERR_CREATE_STREAM_FAILED: -108,

    ERR_API_PARAMETERS: -109,
    ERR_SESSION_ROOM_FULL: -110,
    ERR_SESSION_ROOM_LOCKED: -111,
    ERR_SESSION_NO_ADMIN_PRIVILEGE: -112,
    ERR_SESSION_NO_MODERATOR_PRIVILEGE: -113,
    ERR_SESSION_ADMIN_NOT_JOINED: -114

};
