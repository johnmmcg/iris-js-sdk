// Copyright 2016 Comcast Cable Communications Management, LLC

/**
 * Events related to Iris Connection and Iris Session
 * @namespace
 */

var RtcEvents = module.exports;

RtcEvents = {

    CONNECTION_OPEN: "Connection.onOpen",
    CONNECTION_CLOSE: "Connection.onClose",
    CONNECTION_ERROR: "Connection.onError",

    CREATE_ROOT_EVENT_SUCCESS: "Session.onCreateRootEventWithRoomIdSent",


    CREATE_ROOT_EVENT_ERROR: "Session.onCreateRootEventWithRoomIdError",


}