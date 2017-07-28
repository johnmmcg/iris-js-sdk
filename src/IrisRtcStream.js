// Copyright 2016 Comcast Cable Communications Management, LLC

// IrisRtcStream.js : Javascript code for creating audio and video streams

// Import the modules
var logger = require('./modules/RtcLogger.js');
var errors = require('./modules/RtcErrors.js');
var rtcConfig = require('./modules/RtcConfig.js');
var WebRTC = require('./modules/RtcWebrtcAdapter.js');
var Resolutions = require('./modules/Utils/Resolutions.js');

/**
 * Constructor for IrisRtcStream<br/>
 * This class maintains Iris APIs used to create local video and audio tracks. When new IrisRtcSession is created
 * Iris streams are associated with the session.
 * @constructor
 */
function IrisRtcStream() {
    this.localStream = null;
}

/**
 * This API is called to create local streams based on the streamConfig set by the user <code>streamConfig</code> is a json object.
 * Client can either set the Media Constraints with <code>streamConfig.constraints</code> or just 
 * set the type of the strem he wants <code>streamConfig.streamType</code> as "audio" or "video".<br/>
 * Client can also set few other parameters if streamType is used like resloution, bandwidth and fps.
 * @param {json} streamConfig  - Stream config json example as mentioned
 * @param {string} streamConfig.streamType - Type of stream audio or video
 * @param {string} streamConfig.resolution - Resolution for the video
 * @param {string} streamConfig.fps - Frames per second
 * @param {json} streamConfig.constraints - Media constraints for audio and video
 * @param {string} streamConfig.constraints.audio - Media constraints for audio
 * @param {string} streamConfig.constraints.video - Media constraints for video
 * @param {string} streamConfig.screenShare - True if it is a screen share call
 */
IrisRtcStream.prototype.createStream = function(streamConfig) {

    // assign self
    var self = this;
    self.streamConfig = streamConfig;
    try {
        // Save the stream config in rtcConfig
        rtcConfig.streamConfig = streamConfig;

        // Get media constraints required to getUserMedia 
        var constraints = getMediaConstraints(streamConfig);
        if (!constraints) {
            return;
        }

        logger.log(logger.level.INFO, "IrisRtcStream",
            " getUserMedia with constraints ", JSON.stringify(constraints));

        // Call getusermedia

        // return new Promise(function(resolve, reject) {
        return getUserMedia(constraints).then(function(stream) {
            logger.log(logger.level.INFO, "IrisRtcStream",
                " getUserMedia Success with constraints " + JSON.stringify(constraints));

            if (stream) {
                // Mute the stream before it is being sent to client
                if (streamConfig.startMutedStream) {
                    if (stream.getVideoTracks() && stream.getVideoTracks().length >= 1)
                        stream.getVideoTracks()[0].enabled = false;
                    if (stream.getAudioTracks() && stream.getAudioTracks().length >= 1)
                        stream.getAudioTracks()[0].enabled = false;
                }

                self.localStream = stream;

                // Callback for local stream created
                self.onLocalStream(stream);
                self.onStreamEndedListener(stream);
                return stream;
            }
        }).catch(function(error) {
            logger.log(logger.level.ERROR, "IrisRtcStream",
                " getUserMedia :: Error :: ", error);
        });
    } catch (error) {
        logger.log(logger.level.ERROR, "IrisRtcSession",
            " Failed to create a local stream ", error);
    }
};

/**
 * Get the media constraints
 * @private
 */
function getMediaConstraints(streamConfig) {
    var constraints = { audio: false, video: false };

    //Check for streamConfig availability
    if (!streamConfig) {
        logger.log(logger.level.ERROR, "IrisRtcStream", "streamConfig is required to create rtc stream");
        return;
    }

    if (streamConfig.constraints) {
        if (streamConfig.constraints.video || streamConfig.constraints.audio) {
            constraints = streamConfig.constraints;

            if (streamConfig.constraints.video) {
                setParamsToConstraints(streamConfig, constraints);
            }

            return constraints;
        } else {
            logger.log(logger.level.ERROR, "IrisRtcStream", "Invalid constraints in streamConfig " + JSON.stringify(streamConfig));
        }
    } else if (streamConfig.streamType) {
        if (streamConfig.streamType == "video") {
            constraints.video = { mandatory: {}, optional: [] };
            constraints.audio = { mandatory: {}, optional: [] };

            if (constraints.video) {
                setParamsToConstraints(streamConfig, constraints);
            }

        } else if (streamConfig.streamType == "audio") {
            constraints.video = false;
            constraints.audio = { mandatory: {}, optional: [] };
        }
        return constraints;
    } else {
        logger.log(logger.level.ERROR, "IrisRtcStream",
            "Invalid streamConfig received " + JSON.stringify(streamConfig));
        return;
    }
}

function setParamsToConstraints(streamConfig, constraints) {

    //Set the required resolution
    if (streamConfig.resolution) {
        _setResolution(constraints, streamConfig.resolution);
    }

    // Set required bandwidth
    if (streamConfig.bandwidth) {
        _setBandwidth(constraints, streamConfig.bandwidth);
    }

    // Set required frames per second
    if (streamConfig.fps) {
        _setFPS(constraints, streamConfig.fps);
    }
}

/**
 * Gets local media stream 
 * @param {json} constraints - get user media constraints for 
 * @private
 */
function getUserMedia(constraints) {
    try {
        logger.log(logger.level.INFO, "IrisRtcStream", " getUserMedia");

        return new Promise(function(resolve, reject) {
            WebRTC.getUserMedia(constraints, function(stream) {
                if (stream) {
                    resolve(stream);
                }
            }, function(err) {
                reject("Failed to get media streams");
            });
        });
    } catch (error) {
        logger.log(logger.level.ERROR, "IrisRtcStream", " Failed to getUserMedia");
    }
};

/**
 * Called when a local stream is created.
 * @param {object} stream - local stream 
 */
IrisRtcStream.prototype.onLocalStream = function(stream) {

};

/**
 * @private
 */
IrisRtcStream.prototype.onStreamEndedListener = function(stream) {
    var self = this;
    try {
        if (stream.getVideoTracks() && stream.getVideoTracks().length > 0) {
            stream.getVideoTracks()[0].onended = function() {
                console.info("Video Stream is stopped");
                self.irisVideoStreamStopped();
            };
        }
        if (stream.getAudioTracks() && stream.getAudioTracks().length > 0) {
            stream.getAudioTracks()[0].onended = function() {
                console.info("Audio Stream is stopped");
                self.irisAudioStreamStopped();
            };
        }
    } catch (error) {
        logger.log(logger.level.ERROR, "IrisRtcStream", " onStreamEndedListener ", error);
    }
};

/**
 * Callback when iris video stream is stopped
 * @private
 */
IrisRtcStream.prototype.irisVideoStreamStopped = function() {
    logger.log(logger.level.INFO, "IrisRtcStream", "Stream is stopped");
};

/**
 * Callback when iris audio stream is stopped
 * @private
 */
IrisRtcStream.prototype.irisAudioStreamStopped = function() {
    logger.log(logger.level.INFO, "IrisRtcStream", "Stream is stopped");
};

/**
 * This API stops the given media stream
 * @param {object} mediaStream - Stream to be stopped
 */
IrisRtcStream.prototype.stopMediaStream = function(mediaStream) {
    try {
        if (!mediaStream) {
            logger.log(logger.level.ERROR, "IrisRtcStream : mediaStream is null");
            return;
        }

        logger.log(logger.level.INFO, "IrisRtcStream : stopMediaStream");

        mediaStream.getTracks().forEach(function(track) {
            track.stop();
        });
    } catch (error) {
        logger.log(logger.level.INFO, "IrisRtcStream : stopMediaStream", error);
        if (mediaStream.stop) {
            mediaStream.stop();
        }
    }

    if (mediaStream.stop) {
        mediaStream.stop();
    }
};

/** 
 *  Mute or Unmute the local video
 * @private
 */
IrisRtcStream.prototype.videoMuteToggle = function() {
    try {
        var self = this;

        if (self.localStream && self.localStream.getVideoTracks() && self.localStream.getVideoTracks().length > 0) {
            this.isVideoMuted = this.localStream.getVideoTracks()[0].enabled;
            logger.log(logger.level.INFO, "IrisRtcStream", "isVideoMuted : " + this.isVideoMuted);
            if (this.isVideoMuted) {
                this.localStream.getVideoTracks()[0].enabled = false;
            } else {
                this.localStream.getVideoTracks()[0].enabled = true;
            }
        }
    } catch (error) {
        logger.log(logger.level.ERROR, "IrisRtcStream", "videoMuteToggle failed : ", error);
    }
};

/**
 * Mute or Unmute the local audio
 * @private
 */
IrisRtcStream.prototype.audioMuteToggle = function() {
    try {
        var self = this;

        if (self.localStream && self.localStream.getAudioTracks() && self.localStream.getAudioTracks().length > 0) {
            this.isAudioMuted = this.localStream.getAudioTracks()[0].enabled;
            logger.log(logger.level.INFO, "IrisRtcStream", "isAudioMuted : " + this.isAudioMuted);
            if (this.isAudioMuted) {
                this.localStream.getAudioTracks()[0].enabled = false;
            } else {
                this.localStream.getAudioTracks()[0].enabled = true;
            }
        }
    } catch (error) {
        logger.log(logger.level.ERROR, "IrisRtcStream", "audioMuteToggle failed : ", error);
    }
};


/**
 * Set the required resolution before calling getUserMedia
 * @private
 */
function _setResolution(constraints, resolution) {

    if (Resolutions[resolution]) {
        constraints.video.mandatory.minWidth = Resolutions[resolution].width;
        constraints.video.mandatory.minHeight = Resolutions[resolution].height;
    }

    if (constraints.video.mandatory.minWidth) {
        constraints.video.mandatory.maxWidth = constraints.video.mandatory.minWidth;
    }

    if (constraints.video.mandatory.minHeight) {
        constraints.video.mandatory.maxHeight = constraints.video.mandatory.minHeight;
    }

}


/**
 * Set the bandwidth
 * @private 
 */
function _setBandwidth(constraints, bandwidth) {
    if (bandwidth) {
        if (!constraints.video) {
            constraints.video = { mandatory: {}, optional: [] };
        }
        constraints.video.optional.push({ bandwidth: bandwidth });
    }
}

/**
 * Set the frames per second(FPS)
 * @private
 */
function _setFPS(constraints, fps) {
    if (fps) {
        if (!constraints.video) {
            // same behaviour as true;
            constraints.video = { mandatory: {}, optional: [] };
        }
        constraints.video.mandatory.minFrameRate = fps;
    }
}

/**
 * Get the media devices
 */
IrisRtcStream.prototype.getMediaDevices = function() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        console.log("enumerateDevices() not supported.");
        return;
    }
    return new Promise(function(resolve, reject) {
        navigator.mediaDevices.enumerateDevices()
            .then(function(devices) {
                resolve(devices);
            })
    })

};

// Defining the API module

module.exports = IrisRtcStream;