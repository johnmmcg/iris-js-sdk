// Copyright 2018 Comcast Cable Communications Management, LLC

// IrisRtcStats.js : Javascript code for managing webrtc stats

// Defining the API module 
module.exports = RtcStats;


var logger = require('./RtcLogger.js');
var https = require('https');
var RtcBrowserType = require('./Utils/RtcBrowserType.js');
/** 
 * @constructor
 * @param {options} 
 */
function RtcStats(options) {

    this.options = options;
    this.rtcgSessionId = "";
    this.RxVideoStatsFlag = false;
    this.RxAudioStatsFlag = false;
    this.TxVideoStatsFlag = false;
    this.TxAudioStatsFlag = false;
    this.genericFlag = false;
    this.ReceiveBandwidth = [];
    this.SendBandwidth = [];
    this.TransmitBitrate = [];
    this.rxbytesReceived = [];
    this.FrameHeightReceived = [];
    this.FrameRateReceived = [];
    this.FrameWidthReceived = [];
    this.rxpacketsLost = [];
    this.rxpacketsReceived = [];
    this.audioOutputLevel = [];
    this.rxAudioBytesReceived = [];
    this.rxAudiopacketsLost = [];
    this.rxAudiopacketsReceived = [];
    this.googDecodingPLCCNG = [];
    this.googDecodingCNG = [];
    this.googJitterBufferMs = [];
    this.rxgoogJitterBufferMs = [];
    this.googPreferredJitterBufferMs = [];
    this.googDecodingPLC = [];
    this.googDecodingNormal = [];
    this.googJitterReceived = [];
    this.googDecodingCTSG = [];
    this.googDecodingCTN = [];
    this.googCurrentDelayMs = [];
    this.googCaptureStartNtpTimeMs = [];
    this.rxgoogCaptureStartNtpTimeMs = [];
    this.txbytesSent = [];
    this.EncodeUsagePercent = [];
    this.FrameHeightSent = [];
    this.FrameRateSent = [];
    this.FrameWidthSent = [];
    this.txRtt = [];
    this.txApacketsLost = [];
    this.txApacketsSent = [];
    this.audioInputLevel = [];
    this.txAbytesSent = [];
    this.googFrameWidthInput = [];
    this.googPlisReceived = [];
    this.googAvgEncodeMs = [];
    this.googFrameHeightInput = [];
    this.googFrameWidthSent = [];
    this.txpacketsLost = [];
    this.txpacketsSent = [];
    this.timestamp = 0;
    this.rxCurrentDelayMs = [];
    this.googFirsReceived = [];
    this.googFrameRateSent = [];
    this.googAdaptationChanges = [];
    this.googFrameRateInput = [];
    this.txAgoogRtt = [];
    this.googNacksReceived = [];
    this.googCodecName = "";
    this.googEchoCancellationReturnLoss = [];
    this.googEchoCancellationEchoDelayStdDev = [];
    this.googEchoCancellationQualityMin = [];
    this.txAgoogCodecName = "";
    this.googEchoCancellationReturnLossEnhancement = [];
    this.googEchoCancellationEchoDelayMedian = [];
    this.rxgoogJitterReceived = [];
    this.googFirsSent = [];
    this.googFrameRateDecoded = [];
    this.googMaxDecodeMs = [];
    this.googRenderDelayMs = [];
    this.googFrameRateOutput = [];
    this.googMinPlayoutDelayMs = [];
    this.googNacksSent = [];
    this.googTargetDelayMs = [];
    this.googDecodeMs = [];
    this.googPlisSent = [];
    this.googRetransmitBitrate = [];
    this.googActualEncBitrate = [];
    this.timeseries;
    this.events = [];
    this.aQuery = [];
    this.RxTimestamp = 0;
    this.TxTimeStamp = 0
    this.callEndTime = 0;
    this.callStartTime = 0;
    this.startCallTimeStamp = 0;
    this.statsCounter = 10;
    this.NetworkQuality = { 'WebRTCBadNetwork': 1, 'WebRTCPoorNetwork': 2, 'WebRTCFairNetwork': 3, 'WebRTCGoodNetwork': 4, 'WebRTCExcellentNetwork': 5 };
    this.NETWORK_CHECK_VAL = 5;
    this.rttArray = [];
    this.packetLossArray = [];
    this.RecvBWArray = [];
    this.arrayIndex = 0;
    this.currentRecvBwvalue = 0;
    this.newRecvBwvalue = 0;

    this.currentPacketLossvalue = 0;
    this.newPacketLossvalue = 0;

    this.DEFAULT_MIN_REQUIRED_RECVBW_LEVEL1 = 100;
    this.DEFAULT_MIN_REQUIRED_RECVBW_LEVEL2 = 250;
    this.DEFAULT_MIN_REQUIRED_RECVBW_LEVEL3 = 450;
    this.DEFAULT_MIN_REQUIRED_RECVBW_LEVEL4 = 1000;

    this.DEFAULT_MAX_THRESHOLD_PACKETLOSS_LEVEL1 = 50;
    this.DEFAULT_MAX_THRESHOLD_PACKETLOSS_LEVEL2 = 20;
    this.DEFAULT_MAX_THRESHOLD_PACKETLOSS_LEVEL3 = 10;
    this.DEFAULT_MAX_THRESHOLD_PACKETLOSS_LEVEL4 = 2;

    this.newNetworkQualityLevel = 0;

    this.oldbytesRec = 0;
    this.newbytesRec = 0;

    this.oldPacketLoss = 0;
    this.newPacketLoss = 0;

    this.oldPacketRecv = 0;
    this.newPacketRecv = 0;

    this.AvgSignalOfCall = 0;

    this.submitLevel = 0;
    this.statsInterval = 10000;
};

/**
 * This function decide the signal strength of the current call
 * @type {Function}
 */
RtcStats.prototype.checkNetworkState = function() {
    var self = this;
    // Receive BW
    var minBW = Math.min.apply(Math, self.RecvBWArray);
    self.updateReceiveBWLevel(minBW);
    self.newNetworkQualityLevel = self.NetworkQuality.WebRTCBadNetwork;
    if (self.newRecvBwvalue <= self.currentRecvBwvalue) {
        var maxBW = Math.max.apply(Math, self.RecvBWArray);
        self.updateReceiveBWLevel(maxBW);
        if (self.newRecvBwvalue < self.currentRecvBwvalue) {
            self.currentRecvBwvalue = self.newRecvBwvalue;
        }
    } else {
        self.currentRecvBwvalue = self.newRecvBwvalue;
    }
    //TODO: Consider RTT, PacketLoss parameters
    var maxPacketLoss = Math.max.apply(Math, self.packetLossArray);
    self.updatePacketLossLevel(maxPacketLoss);
    if (self.newPacketLossvalue <= self.currentPacketLossvalue) {
        var minPacketLoss = Math.min.apply(Math, self.packetLossArray);
        self.updatePacketLossLevel(minPacketLoss);
        if (self.newPacketLossvalue < self.currentPacketLossvalue) {
            self.currentPacketLossvalue = self.newPacketLossvalue;
        }
    } else {
        self.currentPacketLossvalue = self.newPacketLossvalue;
    }
    if (self.currentPacketLossvalue >= self.currentRecvBwvalue) {
        self.finalLevel = self.currentRecvBwvalue;
    } else {
        self.finalLevel = self.currentPacketLossvalue;
    }
    self.AvgSignalOfCall = (self.AvgSignalOfCall + self.finalLevel) / 2;


};

/**
 * This function decide the PLV level
 * @type {Function}
 * @param { PLV value}
 */
RtcStats.prototype.updatePacketLossLevel = function(packetLossValue) {
    var self = this;

    try {
        if (packetLossValue < self.DEFAULT_MAX_THRESHOLD_PACKETLOSS_LEVEL4) {
            self.newPacketLossvalue = self.NetworkQuality.WebRTCExcellentNetwork.value;
        } else if (packetLossValue > self.DEFAULT_MAX_THRESHOLD_PACKETLOSS_LEVEL4 &&
            packetLossValue < self.DEFAULT_MAX_THRESHOLD_PACKETLOSS_LEVEL3) {
            self.newPacketLossvalue = self.NetworkQuality.WebRTCGoodNetwork.value;
        } else if (packetLossValue > self.DEFAULT_MAX_THRESHOLD_PACKETLOSS_LEVEL3 &&
            packetLossValue < self.DEFAULT_MAX_THRESHOLD_PACKETLOSS_LEVEL2) {
            self.newPacketLossvalue = self.NetworkQuality.WebRTCFairNetwork.value;
        } else if (packetLossValue > self.DEFAULT_MAX_THRESHOLD_PACKETLOSS_LEVEL2 &&
            packetLossValue < self.DEFAULT_MAX_THRESHOLD_PACKETLOSS_LEVEL1) {
            self.newPacketLossvalue = self.NetworkQuality.WebRTCPoorNetwork.value;
        } else if (packetLossValue > self.DEFAULT_MAX_THRESHOLD_PACKETLOSS_LEVEL1) {
            self.newPacketLossvalue = self.NetworkQuality.WebRTCBadNetwork.value;
        }

    } catch (error) {

    }

};

/**
 * This function decide the BW level
 * @type {Function}
 * @param {BW value}
 */
RtcStats.prototype.updateReceiveBWLevel = function(recvBWValue) {
    var self = this;

    try {
        if (recvBWValue > self.DEFAULT_MIN_REQUIRED_RECVBW_LEVEL4) {
            self.newRecvBwvalue = self.NetworkQuality.WebRTCExcellentNetwork.value;
        } else if (recvBWValue < self.DEFAULT_MIN_REQUIRED_RECVBW_LEVEL4 &&
            recvBWValue > self.DEFAULT_MIN_REQUIRED_RECVBW_LEVEL3) {
            self.newRecvBwvalue = self.NetworkQuality.WebRTCGoodNetwork.value;
        } else if (recvBWValue < self.DEFAULT_MIN_REQUIRED_RECVBW_LEVEL3 &&
            recvBWValue > self.DEFAULT_MIN_REQUIRED_RECVBW_LEVEL2) {
            self.newRecvBwvalue = self.NetworkQuality.WebRTCFairNetwork.value;
        } else if (recvBWValue < self.DEFAULT_MIN_REQUIRED_RECVBW_LEVEL2 &&
            recvBWValue > self.DEFAULT_MIN_REQUIRED_RECVBW_LEVEL1) {
            self.newRecvBwvalue = self.NetworkQuality.WebRTCPoorNetwork.value;
        } else if (recvBWValue < self.DEFAULT_MIN_REQUIRED_RECVBW_LEVEL1) {
            self.newRecvBwvalue = self.NetworkQuality.WebRTCBadNetwork.value;
        }

    } catch (error) {

    }

};

/**
 * This function saves the event details
 * @type {Function}
 */
RtcStats.prototype.eventLogs = function(eventName, json) {
    var self = this;
    this.events.push({ "n": eventName, "timestamp": new Date(), "attr": json });
};

/**
 * This function uploads the statistics(JSON object) of the current call to backend server
 * @type {Function}
 */
RtcStats.prototype.submitStats = function() {

    logger.log(logger.level.INFO, "IrisRtcStats",
        " Submitting the stats ");
    var self = this;

    if (typeof statsTimer != 'undefined') {
        logger.log(logger.level.INFO, "IrisRtcStats", "Clearing the interval !!!");
        clearInterval(statsTimer);
        statsTimer = null;
    }
    if (self.callStartTime == 0) return;

    self.callEndTime = new Date();
    pc = 'undefined';
    var callDuration = "";
    var date1_ms = self.callStartTime.getTime();
    var date2_ms = self.callEndTime.getTime();
    var difference_ms = date2_ms - date1_ms;

    difference_ms = difference_ms / 1000;
    var seconds = Math.floor(difference_ms % 60);
    difference_ms = difference_ms / 60;
    var minutes = Math.floor(difference_ms % 60);
    difference_ms = difference_ms / 60;
    var hours = Math.floor(difference_ms % 24);

    if (hours < 10) {
        hours = '0' + hours;
    }
    if (minutes < 10) {
        minutes = '0' + minutes;
    }
    if (seconds < 10) {
        seconds = '0' + seconds;
    }
    callDuration = hours + ':' + minutes + ':' + seconds;

    logger.log(logger.level.INFO, "IrisRtcStats",
        "Call Duration = " + callDuration);
    var tempDuration = callDuration.split(':');
    if ((tempDuration[0] * 3600 + tempDuration[1] * 3600 + tempDuration[2]) > 10) {
        logger.log(logger.level.INFO, "IrisRtcStats",
            "AvgSignalLevel = " + self.AvgSignalOfCall);
    }

    self.parseUserAgent();

    var statsPayload = {
        "meta": {
            "sdkVersion": self.options.sdkVersion,
            "sdkType": "iris-js-sdk",
            "userAgent": self.userAgent,
            "browser": self.browserName,
            "browserVersion": self.browserVersion
        },
        "streaminfo": {
            "UID": self.options.UID,
            "wsServer": self.options.wsServer,
            "rtcServer": self.options.rtcServer,
            "turnIP": "",
            "turnUsed": "0",
            "roomId": self.options.roomId,
            "routingId": self.options.routingId,
            "traceId": self.options.traceId,
            "duration": callDuration,
            "startTime": self.callStartTime.toString(),
            "stopTime": self.callEndTime.toString()
        },
        "events": self.events,
        "timeseries": self.timeseries
    };

    logger.log(logger.level.INFO, "IrisRtcStats",
        "FinalStats :: " + JSON.stringify(statsPayload));

    var statsServer = self.options.UEStatsServer ? self.options.UEStatsServer : "webrtcstats.g.comcast.net";

    if (statsServer) {
        sendRequest(statsServer, statsPayload);
    } else {
        logger.log(logger.level.ERROR, "IrisRtcStats",
            "config.urls.UEStatsServer is not available");
    }
};

function getStats(peerconnection, callback, errback) {
    if (RtcBrowserType.isFirefox()) {

        if (!errback)
            errback = function() {};
        if (peerconnection.getStats) {
            peerconnection.getStats(null, callback, errback);
        }
    } else {
        if (peerconnection.getStats) {
            peerconnection.getStats(callback);
        }
    }
};

RtcStats.prototype.getPeerStatsEndCall = function(conn, statsInterval, timerFlag) {

    logger.log(logger.level.VERBOSE, "IrisRtcStats",
        "inside getPeerStats", conn);
    var timeseriesResult = null;
    var self = this;
    pc = conn;
    var iFrozenLevel = 0;
    elementIndex = 0;
    self.statsInterval = statsInterval;
    TempbytesReceived = "";

    function AugumentedStatsResponse(response) {
        this.response = response;
        this.addressPairMap = [];
    }

    AugumentedStatsResponse.prototype.result = function() {
        return this.response.result();
    }

    AugumentedStatsResponse.prototype.get = function(key) {
        return this.response[key];
    }
    if (pc == null) {
        if (typeof statsTimer != 'undefined') {
            clearTimeout(statsTimer);
        }

    }

    function candidate(obj) {
        var names = obj.names();

        /*for (var i = 0; i < names.length; ++i) {

            switch (names[i]) {
                case 'networkType':
                    logger.log(logger.level.INFO, "IrisRtcStats","networkType" + obj.stat(names[i]));
            }
        }*/
    }

    function RxVideoStats(obj) {
        var names = obj.names();
        if (obj.stat("googTrackId") === 'mixedlabelvideo0')
            return;
        for (var i = 0; i < names.length; ++i) {

            switch (names[i]) {

                case 'googFrameRateReceived':
                    self.FrameRateReceived.push(obj.stat(names[i]));
                    break;
                case 'bytesReceived':
                    self.rxbytesReceived.push(obj.stat(names[i]));
                    break;
                case 'googFrameHeightReceived':
                    self.FrameHeightReceived.push(obj.stat(names[i]));
                    break;
                case 'googFrameWidthReceived':
                    self.FrameWidthReceived.push(obj.stat(names[i]));
                    break;
                case 'packetsLost':
                    self.rxpacketsLost.push(obj.stat(names[i]));
                    break;
                case 'packetsReceived':
                    self.rxpacketsReceived.push(obj.stat(names[i]));
                    break;
                case 'googCurrentDelayMs':
                    self.rxCurrentDelayMs.push(obj.stat(names[i]));
                    break;
                case 'googFirsSent':
                    self.googFirsSent.push(obj.stat(names[i]));
                    break;
                case 'googFrameRateDecoded':
                    self.googFrameRateDecoded.push(obj.stat(names[i]));
                    break;
                case 'googJitterBufferMs':
                    self.googJitterBufferMs.push(obj.stat(names[i]));
                    break;
                case 'googMaxDecodeMs':
                    self.googMaxDecodeMs.push(obj.stat(names[i]));
                    break;
                case 'googRenderDelayMs':
                    self.googRenderDelayMs.push(obj.stat(names[i]));
                    break;
                case 'googFrameRateOutput':
                    self.googFrameRateOutput.push(obj.stat(names[i]));
                    break;
                case 'googMinPlayoutDelayMs':
                    self.googMinPlayoutDelayMs.push(obj.stat(names[i]));
                    break;
                case 'googNacksSent':
                    self.googNacksSent.push(obj.stat(names[i]));
                    break;
                case 'googTargetDelayMs':
                    self.googTargetDelayMs.push(obj.stat(names[i]));
                    break;
                case 'googCaptureStartNtpTimeMs':
                    self.googCaptureStartNtpTimeMs.push(obj.stat(names[i]));
                    break;
                case 'googDecodeMs':
                    self.googDecodeMs.push(obj.stat(names[i]));
                    break;
                case 'googPlisSent':
                    self.googPlisSent.push(obj.stat(names[i]));
                    break;
                default:

            }

        }
        this.RxVideoStatsFlag = true;
    }

    function RxAudioStats(obj) {
        var names = obj.names();
        if (obj.stat("googTrackId") === 'mixedlabelaudio0')
            return;
        for (var i = 0; i < names.length; ++i) {

            switch (names[i]) {
                case 'audioOutputLevel':
                    self.audioOutputLevel.push(obj.stat(names[i]));
                    break;
                case 'bytesReceived':
                    self.rxAudioBytesReceived.push(obj.stat(names[i]));
                    break;
                case 'packetsLost':
                    self.rxAudiopacketsLost.push(obj.stat(names[i]));
                    break;
                case 'packetsReceived':
                    self.rxAudiopacketsReceived.push(obj.stat(names[i]));
                    break;
                case 'googDecodingCNG':
                    self.googDecodingCNG.push(obj.stat(names[i]));
                    break;
                case 'googDecodingPLCCNG':
                    self.googDecodingPLCCNG.push(obj.stat(names[i]));
                    break;
                case 'googJitterBufferMs':
                    self.rxgoogJitterBufferMs.push(obj.stat(names[i]));
                    break;
                case 'googPreferredJitterBufferMs':
                    self.googPreferredJitterBufferMs.push(obj.stat(names[i]));
                    break;
                case 'googDecodingPLC':
                    self.googDecodingPLC.push(obj.stat(names[i]));
                    break;
                case 'googDecodingNormal':
                    self.googDecodingNormal.push(obj.stat(names[i]));
                    break;
                case 'googCurrentDelayMs':
                    self.googCurrentDelayMs.push(obj.stat(names[i]));
                    break;
                case 'googCaptureStartNtpTimeMs':
                    self.rxgoogCaptureStartNtpTimeMs.push(obj.stat(names[i]));
                    break;
                case 'googJitterReceived':
                    self.rxgoogJitterReceived.push(obj.stat(names[i]));
                    break;
                case 'googDecodingCTSG':
                    self.googDecodingCTSG.push(obj.stat(names[i]));
                    break;
                case 'googDecodingCTN':
                    self.googDecodingCTN.push(obj.stat(names[i]));
                    break;
                default:

            }
        }
        this.RxAudioStatsFlag = true;
    }

    function TxAudioStats(obj) {
        var names = obj.names();
        for (var i = 0; i < names.length; ++i) {

            switch (names[i]) {
                case 'audioInputLevel':
                    self.audioInputLevel.push(obj.stat(names[i]));
                    break;
                case 'bytesSent':
                    self.txAbytesSent.push(obj.stat(names[i]));
                    break;
                case 'packetsLost':
                    self.txApacketsLost.push(obj.stat(names[i]));
                    break;
                case 'packetsSent':
                    self.txApacketsSent.push(obj.stat(names[i]));
                    break;
                case 'googEchoCancellationReturnLoss':
                    self.googEchoCancellationReturnLoss.push(obj.stat(names[i]));
                    break;
                case 'googEchoCancellationEchoDelayStdDev':
                    self.googEchoCancellationEchoDelayStdDev.push(obj.stat(names[i]));
                    break;
                case 'googEchoCancellationQualityMin':
                    self.googEchoCancellationQualityMin.push(obj.stat(names[i]));
                    break;
                case "googCodecName":
                    self.txAgoogCodecName = obj.stat(names[i]);
                    break;
                case 'googRtt':
                    self.txAgoogRtt.push(obj.stat(names[i]));
                    break;
                case 'googEchoCancellationEchoDelayMedian':
                    self.googEchoCancellationEchoDelayMedian.push(obj.stat(names[i]));
                    break;
                case 'googJitterReceived':
                    self.googJitterReceived.push(obj.stat(names[i]));
                    break;
                case 'googEchoCancellationReturnLossEnhancement':
                    self.googEchoCancellationReturnLossEnhancement.push(obj.stat(names[i]));
                    break;
                default:

            }
        }

        this.TxAudioStatsFlag = true;
    }

    function TxVideoStats(obj) {
        var names = obj.names();
        for (var i = 0; i < names.length; ++i) {

            switch (names[i]) {
                case 'bytesSent':
                    self.txbytesSent.push(obj.stat(names[i]));
                    break;
                case 'googEncodeUsagePercent':
                    self.EncodeUsagePercent.push(obj.stat(names[i]));
                    break;
                case 'googFrameHeightSent':
                    self.FrameHeightSent.push(obj.stat(names[i]));
                    break;
                case 'googFrameWidthSent':
                    self.FrameWidthSent.push(obj.stat(names[i]));
                    break;
                case 'googRtt':
                    self.txRtt.push(obj.stat(names[i]));
                    break;
                case 'packetsLost':
                    self.txpacketsLost.push(obj.stat(names[i]));
                    break;
                case 'packetsSent':
                    self.txpacketsSent.push(obj.stat(names[i]));
                    break;

                case 'googFrameRateSent':
                    self.FrameRateSent.push(obj.stat(names[i]));
                    break;
                case 'googAdaptationChanges':
                    self.googAdaptationChanges.push(obj.stat(names[i]));
                    break;
                case 'googFrameRateInput':
                    self.googFrameRateInput.push(obj.stat(names[i]));
                    break;
                case 'googNacksReceived':
                    self.googNacksReceived.push(obj.stat(names[i]));
                    break;
                case 'googFrameWidthInput':
                    self.googFrameWidthInput.push(obj.stat(names[i]));
                    break;
                case 'googPlisReceived':
                    self.googPlisReceived.push(obj.stat(names[i]));
                    break;
                case 'googAvgEncodeMs':
                    self.googAvgEncodeMs.push(obj.stat(names[i]));
                    break;
                case 'googFrameHeightInput':
                    self.googFrameHeightInput.push(obj.stat(names[i]));
                    break;
                case 'googCodecName':
                    self.googCodecName = obj.stat(names[i]);
                    break;
                case 'googFirsReceived':
                    self.googFirsReceived.push(obj.stat(names[i]));
                    break;
                default:

            }
        }
        this.TxVideoStatsFlag = true;
    }

    function generic(obj) {
        var names = obj.names();
        for (var i = 0; i < names.length; ++i) {

            switch (names[i]) {
                case 'googAvailableReceiveBandwidth':
                    self.ReceiveBandwidth.push(obj.stat(names[i]));
                    break;
                case 'googAvailableSendBandwidth':
                    self.SendBandwidth.push(obj.stat(names[i]));
                    break;
                case 'googRetransmitBitrate':
                    self.googRetransmitBitrate.push(obj.stat(names[i]));
                    break;
                case 'googActualEncBitrate':
                    self.googActualEncBitrate.push(obj.stat(names[i]));
                    break;
                case 'googTransmitBitrate':
                    self.TransmitBitrate.push(obj.stat(names[i]));
                    break;
            }
        }
        self.genericFlag = true;
    }

    function logStats(obj) {
        self.timestamp = obj.timestamp;

        if (obj.names) {
            var names = obj.names();
            // logger.log(logger.level.VERBOSE, "RtcStats", "Names of each stats object : " + JSON.stringify(names));
            // logger.log(logger.level.VERBOSE, "RtcStats", "Names of each stats object : " + JSON.stringify(obj.stat(names[i])));

            for (var i = 0; i < names.length; ++i) {
                if (names[i] == 'audioOutputLevel') {
                    RxAudioStats(obj);
                    break;
                } else if (names[i] == 'googFrameHeightReceived') {
                    RxVideoStats(obj);
                    break;
                } else if (names[i] == 'googFrameHeightSent') {
                    TxVideoStats(obj);
                    break;
                } else if (names[i] == 'audioInputLevel') {
                    TxAudioStats(obj);
                    break;
                } else if (names[i] == 'candidateType') {
                    candidate(obj);
                    break;
                } else if (names[i] == 'googAvailableSendBandwidth') {
                    generic(obj);
                    break;
                }
            }
        }
    }

    if (pc) {
        self.callStartTime = new Date();
        var arrayIndex = 0;
        logger.log(logger.level.VERBOSE, "IrisRtcStats", "self.callStartTime  :: " + self.callStartTime.toString());



        function callStatsTimer(cb) {

            self.RxVideoStatsFlag = false;
            self.RxAudioStatsFlag = false;
            self.TxVideoStatsFlag = false;
            self.TxAudeoStatsFlag = false;
            self.genericFlag = false;
            getStats(pc, function(rawStats) {

                var stats = new AugumentedStatsResponse(rawStats);
                var results = "";
                if (rawStats.result) {
                    results = stats.result();
                } else {
                    results = rawStats;
                    logger.log(logger.level.VERBOSE, "RtcStats", "Raw Stats : \n" + JSON.stringify(rawStats));
                }
                elementIndex = 0;
                //logger.log(logger.level.INFO, "IrisRtcStats", "parent results.length is " + results.length);
                for (var i = 0; i < results.length; ++i) {
                    elementIndex++;
                    var res = results[i];

                    if (res) {
                        // logger.log(logger.level.INFO, "IrisRtcStats", "Each Stat Object : \n" + res);
                        logStats(res);
                    }
                }
                if (this.RxVideoStatsFlag == false) {
                    self.ReceiveBandwidth.push("0");
                    self.FrameRateReceived.push("0");
                    self.rxbytesReceived.push("0");
                    self.FrameHeightReceived.push("0");
                    self.FrameWidthReceived.push("0");
                    self.rxpacketsLost.push("0");
                    self.rxpacketsReceived.push("0");
                    self.rxCurrentDelayMs.push("0");
                    self.googFirsSent.push("0");
                    self.googFrameRateDecoded.push("0");
                    self.googJitterBufferMs.push("0");
                    self.googMaxDecodeMs.push("0");
                    self.googRenderDelayMs.push("0");
                    self.googFrameRateOutput.push("0");
                    self.googMinPlayoutDelayMs.push("0");
                    self.googNacksSent.push("0");
                    self.googTargetDelayMs.push("0");
                    self.googCaptureStartNtpTimeMs.push("0");
                    self.googDecodeMs.push("0");
                    self.googPlisSent.push("0");
                }
                if (this.RxAudioStatsFlag == false) {
                    self.audioOutputLevel.push("0");
                    self.rxAudioBytesReceived.push("0");
                    self.rxAudiopacketsLost.push("0");
                    self.rxAudiopacketsReceived.push("0");
                    self.googDecodingCNG.push("0");
                    self.googDecodingPLCCNG.push("0");
                    self.rxgoogJitterBufferMs.push("0");
                    self.googPreferredJitterBufferMs.push("0");
                    self.googDecodingPLC.push("0");
                    self.googDecodingNormal.push("0");
                    self.googCurrentDelayMs.push("0");
                    self.googCaptureStartNtpTimeMs.push("0");
                    self.rxgoogJitterReceived.push("0");
                    self.googDecodingCTSG.push("0");
                    self.googDecodingCTN.push("0");
                }
                if (this.TxAudioStatsFlag == false) {
                    self.audioInputLevel.push("0");
                    self.txAbytesSent.push("0");
                    self.txApacketsLost.push("0");
                    self.txApacketsSent.push("0");
                    self.googEchoCancellationReturnLoss.push("0");
                    self.googEchoCancellationEchoDelayStdDev.push("0");
                    self.googEchoCancellationQualityMin.push("0");
                    self.txAgoogCodecName = "0";
                    self.txAgoogRtt.push("0");
                    self.googEchoCancellationEchoDelayMedian.push("0");
                    self.googJitterReceived.push("0");
                    self.googEchoCancellationReturnLossEnhancement.push("0");
                }
                if (this.TxVideoStatsFlag == false) {
                    self.txbytesSent.push("0");
                    self.EncodeUsagePercent.push("0");
                    self.FrameHeightSent.push("0");
                    self.FrameWidthSent.push("0");
                    self.txRtt.push("0");
                    self.txpacketsLost.push("0");
                    self.txpacketsSent.push("0");
                    self.SendBandwidth.push("0");
                    self.FrameRateSent.push("0");
                    self.googAdaptationChanges.push("0");
                    self.googFrameRateInput.push("0");
                    self.googNacksReceived.push("0");
                    self.googFrameWidthInput.push("0");
                    self.googPlisReceived.push("0");
                    self.googAvgEncodeMs.push("0");
                    self.googFrameHeightInput.push("0");
                    self.googCodecName = "0";
                    self.googFirsReceived.push("0");
                }
                if (this.generalFlag == false) {
                    self.ReceiveBandwidth.push("0");
                    self.SendBandwidth.push("0");
                    self.googRetransmitBitrate.push("0");
                    self.googActualEncBitrate.push("0");
                    self.TransmitBitrate.push("0");
                }
                //if (self.statsCounter == 10) {
                var currentStats = {

                    "General": { "googAvailableReceiveBandwidth": self.ReceiveBandwidth, "googAvailableSendBandwidth": self.SendBandwidth, "googTransmitBitrate": self.TransmitBitrate, "googRetransmitBitrate": self.googRetransmitBitrate, "googActualEncBitrate": self.googActualEncBitrate, "timestamp": self.timestamp },
                    "rxVideo": {
                        "bytesReceived": self.rxbytesReceived,
                        "googCurrentDelayMs": self.rxCurrentDelayMs,
                        "googFrameHeightReceived": self.FrameHeightReceived,
                        "googFrameRateReceived": self.FrameRateReceived,
                        "googFrameWidthReceived": self.FrameWidthReceived,
                        "packetsLost": self.rxpacketsLost,
                        "packetsReceived": self.rxpacketsReceived,
                        "googFirsSent": self.googFirsSent,
                        "googFrameRateDecoded": self.googFrameRateDecoded,
                        "googJitterBufferMs": self.rxgoogJitterBufferMs,
                        "googMaxDecodeMs": self.googMaxDecodeMs,
                        "googRenderDelayMs": self.googRenderDelayMs,
                        "googFrameRateOutput": self.googFrameRateOutput,
                        "googMinPlayoutDelayMs": self.googMinPlayoutDelayMs,
                        "googNacksSent": self.googNacksSent,
                        "googTargetDelayMs": self.googTargetDelayMs,
                        "googCaptureStartNtpTimeMs": self.googCaptureStartNtpTimeMs,
                        "googDecodeMs": self.googDecodeMs,
                        "googPlisSent": self.googPlisSent
                    },
                    "rxAudio": { "audioOutputLevel": self.audioOutputLevel, "bytesReceived": self.rxAudioBytesReceived, "packetsLost": self.rxAudiopacketsLost, "packetsReceived": self.rxAudiopacketsReceived, "googDecodingCNG": self.googDecodingCNG, "googDecodingPLCCNG": self.googDecodingPLCCNG, "googJitterBufferMs": self.googJitterBufferMs, "googPreferredJitterBufferMs": self.googPreferredJitterBufferMs, "googDecodingPLC": self.googDecodingPLC, "googDecodingNormal": self.googDecodingNormal, "googCurrentDelayMs": self.googCurrentDelayMs, "googJitterReceived": self.rxgoogJitterReceived, "googCaptureStartNtpTimeMs": self.rxgoogCaptureStartNtpTimeMs, "googDecodingCTN": self.googDecodingCTN, "googDecodingCTSG": self.googDecodingCTSG },
                    "txVideo": {
                        "bytesSent": self.txbytesSent,
                        "googEncodeUsagePercent": self.EncodeUsagePercent,
                        "googFrameHeightSent": self.FrameHeightSent,
                        "googFrameRateSent": self.FrameRateSent,
                        "googFrameWidthSent": self.FrameWidthSent,
                        "googRtt": self.txRtt,
                        "packetsLost": self.txpacketsLost,
                        "packetsSent": self.txpacketsSent,
                        "googFirsReceived": self.googFirsReceived,
                        "googAdaptationChanges": self.googAdaptationChanges,
                        "googFrameRateInput": self.googFrameRateInput,
                        "googNacksReceived": self.googNacksReceived,
                        "googCodecName": self.googCodecName,
                        "googFrameWidthInput": self.googFrameWidthInput,
                        "googPlisReceived": self.googPlisReceived,
                        "googAvgEncodeMs": self.googAvgEncodeMs,
                        "googFrameHeightInput": self.googFrameHeightInput,
                    },
                    "txAudio": {
                        "audioInputLevel": self.audioInputLevel,
                        "bytesSent": self.txAbytesSent,
                        "packetsLost": self.txApacketsLost,
                        "packetsSent": self.txApacketsSent,
                        "googEchoCancellationReturnLoss": self.googEchoCancellationReturnLoss,
                        "googEchoCancellationEchoDelayStdDev": self.googEchoCancellationEchoDelayStdDev,
                        "googEchoCancellationQualityMin": self.googEchoCancellationQualityMin,
                        "googCodecName": self.txAgoogCodecName,
                        "googRtt": self.txAgoogRtt,
                        "googEchoCancellationEchoDelayMedian": self.googEchoCancellationEchoDelayMedian,
                        "googJitterReceived": self.googJitterReceived,
                        "googEchoCancellationReturnLossEnhancement": self.googEchoCancellationReturnLossEnhancement
                    }


                }
                self.timeseries = currentStats;
                self.statsCounter = 0;
                //} 

                self.statsCounter++;
                //update the arrays
                self.newbytesRec = self.rxbytesReceived;
                var tempReceiveBW = ((self.newbytesRec - self.oldbytesRec) / 1024) * 8;
                self.oldbytesRec = self.newbytesRec;
                self.RecvBWArray[arrayIndex] = tempReceiveBW;

                //packet loss variance
                self.newPacketLoss = self.rxpacketsLost;
                self.newPacketRecv = self.rxpacketsReceived;
                var totalPacketRec = (self.newPacketLoss - self.oldPacketLoss) + (self.newPacketRecv - self.oldPacketRecv);
                var packetLossVariance = (self.newPacketLoss - self.oldPacketLoss) * 100 / totalPacketRec;
                self.oldPacketLoss = self.newPacketLoss;
                self.oldPacketRecv = self.newPacketRecv;
                self.packetLossArray[arrayIndex] = packetLossVariance;
                arrayIndex++;
                if (arrayIndex == self.NETWORK_CHECK_VAL) arrayIndex = 0;
                self.checkNetworkState();

                //Print the stats 
                logger.log(logger.level.VERBOSE, "RtcStats", "Stats ", self.timeseries);
            });

            if (timerFlag) {
                // Collect Stats for every 2 seconds till 30 seconds and the use interval from config
                if (0 < self.localStatInterval && self.localStatInterval < 20000) {
                    self.localStatInterval = self.localStatInterval + 2000;
                } else if (self.localStatInterval == 20000) {
                    //Clear interval and set the localStatInterval to zero
                    self.localStatInterval = 0;
                    clearInterval(statsTimer);

                    //Start stats interval with value from config
                    statsTimer = setInterval(callStatsTimer, self.statsInterval);
                }
            }
            if (cb) {
                cb(self.timeseries);
            }
        }
        if (timerFlag) {
            statsTimer = setInterval(callStatsTimer, self.localStatInterval);
        } else {
            // 
            callStatsTimer((result) => {
                timeseriesResult = result;
                return;
            });

        }

    }
    if (!timerFlag) {
        return timeseriesResult;
    }
};


RtcStats.prototype.getPeerStats = function(conn, statsInterval, timerFlag) {

    logger.log(logger.level.INFO, "IrisRtcStats",
        "inside getPeerStats", conn);
    var timeseriesResult = null;
    var self = this;
    pc = conn;
    var iFrozenLevel = 0;
    elementIndex = 0;
    self.statsInterval = statsInterval;
    TempbytesReceived = "";

    function AugumentedStatsResponse(response) {
        this.response = response;
        this.addressPairMap = [];
    }

    AugumentedStatsResponse.prototype.result = function() {
        return this.response.result();
    }

    AugumentedStatsResponse.prototype.get = function(key) {
        return this.response[key];
    }
    if (pc == null) {
        if (typeof statsTimer != 'undefined') {
            clearTimeout(statsTimer);
        }

    }

    function candidate(obj) {
        var names = obj.names();

        /*for (var i = 0; i < names.length; ++i) {

            switch (names[i]) {
                case 'networkType':
                    logger.log(logger.level.INFO, "IrisRtcStats","networkType" + obj.stat(names[i]));
            }
        }*/
    }

    function RxVideoStats(obj) {
        var names = obj.names();
        if (obj.stat("googTrackId") === 'mixedlabelvideo0')
            return;
        for (var i = 0; i < names.length; ++i) {

            switch (names[i]) {

                case 'googFrameRateReceived':
                    self.FrameRateReceived = obj.stat(names[i]);
                    break;
                case 'bytesReceived':
                    self.rxbytesReceived = obj.stat(names[i]);
                    break;
                case 'googFrameHeightReceived':
                    self.FrameHeightReceived = obj.stat(names[i]);
                    break;
                case 'googFrameWidthReceived':
                    self.FrameWidthReceived = obj.stat(names[i]);
                    break;
                case 'packetsLost':
                    self.rxpacketsLost = obj.stat(names[i]);
                    break;
                case 'packetsReceived':
                    self.rxpacketsReceived = obj.stat(names[i]);
                    break;
                case 'googCurrentDelayMs':
                    self.rxCurrentDelayMs = obj.stat(names[i]);
                    break;
                case 'googFirsSent':
                    self.googFirsSent = obj.stat(names[i]);
                    break;
                case 'googFrameRateDecoded':
                    self.googFrameRateDecoded = obj.stat(names[i]);
                    break;
                case 'googJitterBufferMs':
                    self.googJitterBufferMs = obj.stat(names[i]);
                    break;
                case 'googMaxDecodeMs':
                    self.googMaxDecodeMs = obj.stat(names[i]);
                    break;
                case 'googRenderDelayMs':
                    self.googRenderDelayMs = obj.stat(names[i]);
                    break;
                case 'googFrameRateOutput':
                    self.googFrameRateOutput = obj.stat(names[i]);
                    break;
                case 'googMinPlayoutDelayMs':
                    self.googMinPlayoutDelayMs = obj.stat(names[i]);
                    break;
                case 'googNacksSent':
                    self.googNacksSent = obj.stat(names[i]);
                    break;
                case 'googTargetDelayMs':
                    self.googTargetDelayMs = obj.stat(names[i]);
                    break;
                case 'googCaptureStartNtpTimeMs':
                    self.googCaptureStartNtpTimeMs = obj.stat(names[i]);
                    break;
                case 'googDecodeMs':
                    self.googDecodeMs = obj.stat(names[i]);
                    break;
                case 'googPlisSent':
                    self.googPlisSent = obj.stat(names[i]);
                    break;
                default:

            }

        }
        this.RxVideoStatsFlag = true;
    }

    function RxAudioStats(obj) {
        var names = obj.names();
        if (obj.stat("googTrackId") === 'mixedlabelaudio0')
            return;
        for (var i = 0; i < names.length; ++i) {

            switch (names[i]) {
                case 'audioOutputLevel':
                    self.audioOutputLevel = obj.stat(names[i]);
                    break;
                case 'bytesReceived':
                    self.rxAudioBytesReceived = obj.stat(names[i]);
                    break;
                case 'packetsLost':
                    self.rxAudiopacketsLost = obj.stat(names[i]);
                    break;
                case 'packetsReceived':
                    self.rxAudiopacketsReceived = obj.stat(names[i]);
                    break;
                case 'googDecodingCNG':
                    self.googDecodingCNG = obj.stat(names[i]);
                    break;
                case 'googDecodingPLCCNG':
                    self.googDecodingPLCCNG = obj.stat(names[i]);
                    break;
                case 'googJitterBufferMs':
                    self.rxgoogJitterBufferMs = obj.stat(names[i]);
                    break;
                case 'googPreferredJitterBufferMs':
                    self.googPreferredJitterBufferMs = obj.stat(names[i]);
                    break;
                case 'googDecodingPLC':
                    self.googDecodingPLC = obj.stat(names[i]);
                    break;
                case 'googDecodingNormal':
                    self.googDecodingNormal = obj.stat(names[i]);
                    break;
                case 'googCurrentDelayMs':
                    self.googCurrentDelayMs = obj.stat(names[i]);
                    break;
                case 'googCaptureStartNtpTimeMs':
                    self.rxgoogCaptureStartNtpTimeMs = obj.stat(names[i]);
                    break;
                case 'googJitterReceived':
                    self.rxgoogJitterReceived = obj.stat(names[i]);
                    break;
                case 'googDecodingCTSG':
                    self.googDecodingCTSG = obj.stat(names[i]);
                    break;
                case 'googDecodingCTN':
                    self.googDecodingCTN = obj.stat(names[i]);
                    break;
                default:

            }
        }
        this.RxAudioStatsFlag = true;
    }

    function TxAudioStats(obj) {
        var names = obj.names();
        for (var i = 0; i < names.length; ++i) {

            switch (names[i]) {
                case 'audioInputLevel':
                    self.audioInputLevel = obj.stat(names[i]);
                    break;
                case 'bytesSent':
                    self.txAbytesSent = obj.stat(names[i]);
                    break;
                case 'packetsLost':
                    self.txApacketsLost = obj.stat(names[i]);
                    break;
                case 'packetsSent':
                    self.txApacketsSent = obj.stat(names[i]);
                    break;
                case 'googEchoCancellationReturnLoss':
                    self.googEchoCancellationReturnLoss = obj.stat(names[i]);
                    break;
                case 'googEchoCancellationEchoDelayStdDev':
                    self.googEchoCancellationEchoDelayStdDev = obj.stat(names[i]);
                    break;
                case 'googEchoCancellationQualityMin':
                    self.googEchoCancellationQualityMin = obj.stat(names[i]);
                    break;
                case "googCodecName":
                    self.txAgoogCodecName = obj.stat(names[i]);
                    break;
                case 'googRtt':
                    self.txAgoogRtt = obj.stat(names[i]);
                    break;
                case 'googEchoCancellationEchoDelayMedian':
                    self.googEchoCancellationEchoDelayMedian = obj.stat(names[i]);
                    break;
                case 'googJitterReceived':
                    self.googJitterReceived = obj.stat(names[i]);
                    break;
                case 'googEchoCancellationReturnLossEnhancement':
                    self.googEchoCancellationReturnLossEnhancement = obj.stat(names[i]);
                    break;
                default:

            }
        }

        this.TxAudioStatsFlag = true;
    }

    function TxVideoStats(obj) {
        var names = obj.names();
        for (var i = 0; i < names.length; ++i) {

            switch (names[i]) {
                case 'bytesSent':
                    self.txbytesSent = obj.stat(names[i]);
                    break;
                case 'googEncodeUsagePercent':
                    self.EncodeUsagePercent = obj.stat(names[i]);
                    break;
                case 'googFrameHeightSent':
                    self.FrameHeightSent = obj.stat(names[i]);
                    break;
                case 'googFrameWidthSent':
                    self.FrameWidthSent = obj.stat(names[i]);
                    break;
                case 'googRtt':
                    self.txRtt = obj.stat(names[i]);
                    break;
                case 'packetsLost':
                    self.txpacketsLost = obj.stat(names[i]);
                    break;
                case 'packetsSent':
                    self.txpacketsSent = obj.stat(names[i]);
                    break;

                case 'googFrameRateSent':
                    self.FrameRateSent = obj.stat(names[i]);
                    break;
                case 'googAdaptationChanges':
                    self.googAdaptationChanges = obj.stat(names[i]);
                    break;
                case 'googFrameRateInput':
                    self.googFrameRateInput = obj.stat(names[i]);
                    break;
                case 'googNacksReceived':
                    self.googNacksReceived = obj.stat(names[i]);
                    break;
                case 'googFrameWidthInput':
                    self.googFrameWidthInput = obj.stat(names[i]);
                    break;
                case 'googPlisReceived':
                    self.googPlisReceived = obj.stat(names[i]);
                    break;
                case 'googAvgEncodeMs':
                    self.googAvgEncodeMs = obj.stat(names[i]);
                    break;
                case 'googFrameHeightInput':
                    self.googFrameHeightInput = obj.stat(names[i]);
                    break;
                case 'googCodecName':
                    self.googCodecName = obj.stat(names[i]);
                    break;
                case 'googFirsReceived':
                    self.googFirsReceived = obj.stat(names[i]);
                    break;
                default:

            }
        }
        this.TxVideoStatsFlag = true;
    }

    function generic(obj) {
        var names = obj.names();
        for (var i = 0; i < names.length; ++i) {

            switch (names[i]) {
                case 'googAvailableReceiveBandwidth':
                    self.ReceiveBandwidth = obj.stat(names[i]);
                    break;
                case 'googAvailableSendBandwidth':
                    self.SendBandwidth = obj.stat(names[i]);
                    break;
                case 'googRetransmitBitrate':
                    self.googRetransmitBitrate = obj.stat(names[i]);
                    break;
                case 'googActualEncBitrate':
                    self.googActualEncBitrate = obj.stat(names[i]);
                    break;
                case 'googTransmitBitrate':
                    self.TransmitBitrate = obj.stat(names[i]);
                    break;
            }
        }
        self.genericFlag = true;
    }

    function logStats(obj) {
        self.timestamp = obj.timestamp;

        if (obj.names) {
            var names = obj.names();
            // logger.log(logger.level.VERBOSE, "RtcStats", "Names of each stats object : " + JSON.stringify(names));
            // logger.log(logger.level.VERBOSE, "RtcStats", "Names of each stats object : " + JSON.stringify(obj.stat(names[i])));

            for (var i = 0; i < names.length; ++i) {
                if (names[i] == 'audioOutputLevel') {
                    RxAudioStats(obj);
                    break;
                } else if (names[i] == 'googFrameHeightReceived') {
                    RxVideoStats(obj);
                    break;
                } else if (names[i] == 'googFrameHeightSent') {
                    TxVideoStats(obj);
                    break;
                } else if (names[i] == 'audioInputLevel') {
                    TxAudioStats(obj);
                    break;
                } else if (names[i] == 'candidateType') {
                    candidate(obj);
                    break;
                } else if (names[i] == 'googAvailableSendBandwidth') {
                    generic(obj);
                    break;
                }
            }
        }
    }

    if (pc) {
        self.callStartTime = new Date();
        var arrayIndex = 0;
        logger.log(logger.level.VERBOSE, "IrisRtcStats", "self.callStartTime  >>>> " + self.callStartTime.toString());



        function callStatsTimer(cb) {

            self.RxVideoStatsFlag = false;
            self.RxAudioStatsFlag = false;
            self.TxVideoStatsFlag = false;
            self.TxAudeoStatsFlag = false;
            self.genericFlag = false;
            getStats(pc, function(rawStats) {

                var stats = new AugumentedStatsResponse(rawStats);
                var results = "";
                if (rawStats.result) {
                    results = stats.result();
                } else {
                    results = rawStats;
                    logger.log(logger.level.VERBOSE, "RtcStats", "Raw Stats : \n" + JSON.stringify(rawStats));
                }
                elementIndex = 0;
                //logger.log(logger.level.INFO, "IrisRtcStats", "parent results.length is " + results.length);
                for (var i = 0; i < results.length; ++i) {
                    elementIndex++;
                    var res = results[i];

                    if (res) {
                        // logger.log(logger.level.INFO, "IrisRtcStats", "Each Stat Object : \n" + res);
                        logStats(res);
                    }
                }
                if (this.RxVideoStatsFlag == false) {
                    self.ReceiveBandwidth.push("0");
                    self.FrameRateReceived.push("0");
                    self.rxbytesReceived.push("0");
                    self.FrameHeightReceived.push("0");
                    self.FrameWidthReceived.push("0");
                    self.rxpacketsLost.push("0");
                    self.rxpacketsReceived.push("0");
                    self.rxCurrentDelayMs.push("0");
                    self.googFirsSent.push("0");
                    self.googFrameRateDecoded.push("0");
                    self.googJitterBufferMs.push("0");
                    self.googMaxDecodeMs.push("0");
                    self.googRenderDelayMs.push("0");
                    self.googFrameRateOutput.push("0");
                    self.googMinPlayoutDelayMs.push("0");
                    self.googNacksSent.push("0");
                    self.googTargetDelayMs.push("0");
                    self.googCaptureStartNtpTimeMs.push("0");
                    self.googDecodeMs.push("0");
                    self.googPlisSent.push("0");
                }
                if (this.RxAudioStatsFlag == false) {
                    self.audioOutputLevel.push("0");
                    self.rxAudioBytesReceived.push("0");
                    self.rxAudiopacketsLost.push("0");
                    self.rxAudiopacketsReceived.push("0");
                    self.googDecodingCNG.push("0");
                    self.googDecodingPLCCNG.push("0");
                    self.rxgoogJitterBufferMs.push("0");
                    self.googPreferredJitterBufferMs.push("0");
                    self.googDecodingPLC.push("0");
                    self.googDecodingNormal.push("0");
                    self.googCurrentDelayMs.push("0");
                    self.googCaptureStartNtpTimeMs.push("0");
                    self.rxgoogJitterReceived.push("0");
                    self.googDecodingCTSG.push("0");
                    self.googDecodingCTN.push("0");
                }
                if (this.TxAudioStatsFlag == false) {
                    self.audioInputLevel.push("0");
                    self.txAbytesSent.push("0");
                    self.txApacketsLost.push("0");
                    self.txApacketsSent.push("0");
                    self.googEchoCancellationReturnLoss.push("0");
                    self.googEchoCancellationEchoDelayStdDev.push("0");
                    self.googEchoCancellationQualityMin.push("0");
                    self.txAgoogCodecName = "0";
                    self.txAgoogRtt.push("0");
                    self.googEchoCancellationEchoDelayMedian.push("0");
                    self.googJitterReceived.push("0");
                    self.googEchoCancellationReturnLossEnhancement.push("0");
                }
                if (this.TxVideoStatsFlag == false) {
                    self.txbytesSent.push("0");
                    self.EncodeUsagePercent.push("0");
                    self.FrameHeightSent.push("0");
                    self.FrameWidthSent.push("0");
                    self.txRtt.push("0");
                    self.txpacketsLost.push("0");
                    self.txpacketsSent.push("0");
                    self.SendBandwidth.push("0");
                    self.FrameRateSent.push("0");
                    self.googAdaptationChanges.push("0");
                    self.googFrameRateInput.push("0");
                    self.googNacksReceived.push("0");
                    self.googFrameWidthInput.push("0");
                    self.googPlisReceived.push("0");
                    self.googAvgEncodeMs.push("0");
                    self.googFrameHeightInput.push("0");
                    self.googCodecName = "0";
                    self.googFirsReceived.push("0");
                }
                if (this.generalFlag == false) {
                    self.ReceiveBandwidth.push("0");
                    self.SendBandwidth.push("0");
                    self.googRetransmitBitrate.push("0");
                    self.googActualEncBitrate.push("0");
                    self.TransmitBitrate.push("0");
                }
                //if (self.statsCounter == 10) {
                var currentStats = {

                    "General": { "googAvailableReceiveBandwidth": self.ReceiveBandwidth, "googAvailableSendBandwidth": self.SendBandwidth, "googTransmitBitrate": self.TransmitBitrate, "googRetransmitBitrate": self.googRetransmitBitrate, "googActualEncBitrate": self.googActualEncBitrate, "timestamp": self.timestamp },
                    "rxVideo": {
                        "bytesReceived": self.rxbytesReceived,
                        "googCurrentDelayMs": self.rxCurrentDelayMs,
                        "googFrameHeightReceived": self.FrameHeightReceived,
                        "googFrameRateReceived": self.FrameRateReceived,
                        "googFrameWidthReceived": self.FrameWidthReceived,
                        "packetsLost": self.rxpacketsLost,
                        "packetsReceived": self.rxpacketsReceived,
                        "googFirsSent": self.googFirsSent,
                        "googFrameRateDecoded": self.googFrameRateDecoded,
                        "googJitterBufferMs": self.rxgoogJitterBufferMs,
                        "googMaxDecodeMs": self.googMaxDecodeMs,
                        "googRenderDelayMs": self.googRenderDelayMs,
                        "googFrameRateOutput": self.googFrameRateOutput,
                        "googMinPlayoutDelayMs": self.googMinPlayoutDelayMs,
                        "googNacksSent": self.googNacksSent,
                        "googTargetDelayMs": self.googTargetDelayMs,
                        "googCaptureStartNtpTimeMs": self.googCaptureStartNtpTimeMs,
                        "googDecodeMs": self.googDecodeMs,
                        "googPlisSent": self.googPlisSent
                    },
                    "rxAudio": { "audioOutputLevel": self.audioOutputLevel, "bytesReceived": self.rxAudioBytesReceived, "packetsLost": self.rxAudiopacketsLost, "packetsReceived": self.rxAudiopacketsReceived, "googDecodingCNG": self.googDecodingCNG, "googDecodingPLCCNG": self.googDecodingPLCCNG, "googJitterBufferMs": self.googJitterBufferMs, "googPreferredJitterBufferMs": self.googPreferredJitterBufferMs, "googDecodingPLC": self.googDecodingPLC, "googDecodingNormal": self.googDecodingNormal, "googCurrentDelayMs": self.googCurrentDelayMs, "googJitterReceived": self.rxgoogJitterReceived, "googCaptureStartNtpTimeMs": self.rxgoogCaptureStartNtpTimeMs, "googDecodingCTN": self.googDecodingCTN, "googDecodingCTSG": self.googDecodingCTSG },
                    "txVideo": {
                        "bytesSent": self.txbytesSent,
                        "googEncodeUsagePercent": self.EncodeUsagePercent,
                        "googFrameHeightSent": self.FrameHeightSent,
                        "googFrameRateSent": self.FrameRateSent,
                        "googFrameWidthSent": self.FrameWidthSent,
                        "googRtt": self.txRtt,
                        "packetsLost": self.txpacketsLost,
                        "packetsSent": self.txpacketsSent,
                        "googFirsReceived": self.googFirsReceived,
                        "googAdaptationChanges": self.googAdaptationChanges,
                        "googFrameRateInput": self.googFrameRateInput,
                        "googNacksReceived": self.googNacksReceived,
                        "googCodecName": self.googCodecName,
                        "googFrameWidthInput": self.googFrameWidthInput,
                        "googPlisReceived": self.googPlisReceived,
                        "googAvgEncodeMs": self.googAvgEncodeMs,
                        "googFrameHeightInput": self.googFrameHeightInput,
                    },
                    "txAudio": {
                        "audioInputLevel": self.audioInputLevel,
                        "bytesSent": self.txAbytesSent,
                        "packetsLost": self.txApacketsLost,
                        "packetsSent": self.txApacketsSent,
                        "googEchoCancellationReturnLoss": self.googEchoCancellationReturnLoss,
                        "googEchoCancellationEchoDelayStdDev": self.googEchoCancellationEchoDelayStdDev,
                        "googEchoCancellationQualityMin": self.googEchoCancellationQualityMin,
                        "googCodecName": self.txAgoogCodecName,
                        "googRtt": self.txAgoogRtt,
                        "googEchoCancellationEchoDelayMedian": self.googEchoCancellationEchoDelayMedian,
                        "googJitterReceived": self.googJitterReceived,
                        "googEchoCancellationReturnLossEnhancement": self.googEchoCancellationReturnLossEnhancement
                    }


                }
                self.timeseries = currentStats;
                self.statsCounter = 0;
                //} 

                self.statsCounter++;
                //update the arrays
                self.newbytesRec = self.rxbytesReceived;
                var tempReceiveBW = ((self.newbytesRec - self.oldbytesRec) / 1024) * 8;
                self.oldbytesRec = self.newbytesRec;
                self.RecvBWArray[arrayIndex] = tempReceiveBW;

                //packet loss variance
                self.newPacketLoss = self.rxpacketsLost;
                self.newPacketRecv = self.rxpacketsReceived;
                var totalPacketRec = (self.newPacketLoss - self.oldPacketLoss) + (self.newPacketRecv - self.oldPacketRecv);
                var packetLossVariance = (self.newPacketLoss - self.oldPacketLoss) * 100 / totalPacketRec;
                self.oldPacketLoss = self.newPacketLoss;
                self.oldPacketRecv = self.newPacketRecv;
                self.packetLossArray[arrayIndex] = packetLossVariance;
                arrayIndex++;
                if (arrayIndex == self.NETWORK_CHECK_VAL) arrayIndex = 0;
                self.checkNetworkState();

                //Print the stats 
                logger.log(logger.level.VERBOSE, "RtcStats", "Stats ", self.timeseries);

            });

            if (timerFlag) {
                // Collect Stats for every 2 seconds till 30 seconds and the use interval from config
                if (0 < self.localStatInterval && self.localStatInterval < 20000) {
                    self.localStatInterval = self.localStatInterval + 2000;
                } else if (self.localStatInterval == 20000) {
                    //Clear interval and set the localStatInterval to zero
                    self.localStatInterval = 0;
                    clearInterval(statsTimer);

                    //Start stats interval with value from config
                    statsTimer = setInterval(callStatsTimer, self.statsInterval);
                }
            }
            if (cb) {
                cb(self.timeseries);
            }

        }
        if (timerFlag) {
            statsTimer = setInterval(callStatsTimer, self.localStatInterval);
        } else {
            // 
            callStatsTimer((result) => {
                timeseriesResult = result;
                return;
            });

        }

    }
    if (!timerFlag) {
        return timeseriesResult;
    }
};

/**
 * This function to upload the stats
 * @type {Function}
 * @param {method, targetUrl, data, content-type}
 * @private
 */
function sendRequest(url, json) {

    var options = {
        host: url,
        path: '/iris-reference-client-logs',
        method: 'POST',
        rejectUnauthorized: "false",
        headers: {
            "Content-Type": 'application/json',
            "X-Stats-Password": '7wupre5pupa8r8nefebe8umbs5trura32q'
        }
    };


    try {

        logger.log(logger.level.INFO, "IrisRtcStats", "Options for posting logs to stats server " + JSON.stringify(options));

        var req = https.request(options, function(response) {

            logger.log(logger.level.INFO, "IrisRtcStats",
                " Did receive response to Posting Stats to Server  ");

            var body = '';

            // Callback for data
            response.on('data', function(chunk) {
                body += chunk;
            });

            // Callback when complete data is received
            response.on('end', function() {
                logger.log(logger.level.INFO, "IrisRtcStats",
                    " Successfully Posted Stats to Server  ");
            });
        });

        // Catch errors 
        req.on('error', function(e) {
            logger.log(logger.level.ERROR, "IrisRtcStats",
                "   Posting Stats to Server failed with error  " + e);
        });

        // Write json
        req.write(JSON.stringify(json));
        req.end();

    } catch (e) {
        logger.log(logger.level.ERROR, "IrisRtcStats",
            "   Posting Stats to Server failed with error  " + e);
    }
};

RtcStats.prototype.parseUserAgent = function() {
    try {
        var userAgent = (navigator && navigator.userAgent) ? navigator.userAgent : "";

        if (userAgent) {
            this.userAgent = userAgent;
            var tem;
            var M = userAgent.match(/(opera|chrome|safari|firefox|msie|trident(?=\/))\/?\s*(\d+)/i) || [];
            if (/trident/i.test(M[1])) {
                tem = /\brv[ :]+(\d+)/g.exec(userAgent) || [];
                return 'IE ' + (tem[1] || '');
            }
            if (M[1] === 'Chrome') {
                tem = userAgent.match(/\b(OPR|Edge)\/(\d+)/);
                if (tem != null) return tem.slice(1).join(' ').replace('OPR', 'Opera');
            }
            M = M[2] ? [M[1], M[2]] : [navigator.appName, navigator.appVersion, '-?'];
            if ((tem = userAgent.match(/version\/(\d+)/i)) != null) M.splice(1, 1, tem[1]);
            M.join(' ');

            this.browserName = M[0];
            this.browserVersion = M[1]

        }
    } catch (error) {
        logger.log(logger.level.ERROR, "IrisRtcStats", "Failed to parse userAgent");
    }
}
