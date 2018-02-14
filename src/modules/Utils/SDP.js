// Copyright 2018 Comcast Cable Communications Management, LLC

var logger = require('../RtcLogger.js');
var SDPUtil = require("./SDPUtil.js");


// SDP STUFF
function SDP(sdp) {
    /**
     * Whether or not to remove TCP ice candidates when translating from/to jingle.
     * @type {boolean}
     */
    this.removeTcpCandidates = false;

    /**
     * Whether or not to remove UDP ice candidates when translating from/to jingle.
     * @type {boolean}
     */
    this.removeUdpCandidates = false;

    this.media = sdp.split('\r\nm=');
    for (var i = 1; i < this.media.length; i++) {
        this.media[i] = 'm=' + this.media[i];
        if (i != this.media.length - 1) {
            this.media[i] += '\r\n';
        }
    }
    this.session = this.media.shift() + '\r\n';
    this.raw = this.session + this.media.join('');
}

/**
 * Returns map of MediaChannel mapped per channel idx.
 */
SDP.prototype.getMediaSsrcMap = function() {
    var self = this;
    var media_ssrcs = {};
    var tmp;
    for (var mediaindex = 0; mediaindex < self.media.length; mediaindex++) {
        tmp = SDPUtil.find_lines(self.media[mediaindex], 'a=ssrc:');
        var mid = SDPUtil.parse_mid(SDPUtil.find_line(self.media[mediaindex], 'a=mid:'));
        var media = {
            mediaindex: mediaindex,
            mid: mid,
            ssrcs: {},
            ssrcGroups: []
        };
        media_ssrcs[mediaindex] = media;
        tmp.forEach(function(line) {
            var linessrc = line.substring(7).split(' ')[0];
            // allocate new ChannelSsrc
            if (!media.ssrcs[linessrc]) {
                media.ssrcs[linessrc] = {
                    ssrc: linessrc,
                    lines: []
                };
            }
            media.ssrcs[linessrc].lines.push(line);
        });
        tmp = SDPUtil.find_lines(self.media[mediaindex], 'a=ssrc-group:');
        tmp.forEach(function(line) {
            var idx = line.indexOf(' ');
            var semantics = line.substr(0, idx).substr(13);
            var ssrcs = line.substr(14 + semantics.length).split(' ');
            if (ssrcs.length) {
                media.ssrcGroups.push({
                    semantics: semantics,
                    ssrcs: ssrcs
                });
            }
        });
    }
    return media_ssrcs;
};
/**
 * Returns <tt>true</tt> if this SDP contains given SSRC.
 * @param ssrc the ssrc to check.
 * @returns {boolean} <tt>true</tt> if this SDP contains given SSRC.
 */
SDP.prototype.containsSSRC = function(ssrc) {
    var medias = this.getMediaSsrcMap();
    var result = false;
    Object.keys(medias).forEach(function(mediaindex) {

        if (result)
            return true;

        if (medias[mediaindex].ssrcs[ssrc]) {
            result = true;
        }
    });
    return result;


    // if (this.raw.indexOf(ssrc) != -1)
    //     return true;
    // return false;
};

// remove iSAC and CN from SDP
SDP.prototype.mangle = function() {
    var i, j, mline, lines, rtpmap, newdesc;
    for (i = 0; i < this.media.length; i++) {
        lines = this.media[i].split('\r\n');
        lines.pop(); // remove empty last element
        mline = SDPUtil.parse_mline(lines.shift());
        if (mline.media != 'audio')
            continue;
        newdesc = '';
        mline.fmt.length = 0;
        for (j = 0; j < lines.length; j++) {
            if (lines[j].substr(0, 9) == 'a=rtpmap:') {
                rtpmap = SDPUtil.parse_rtpmap(lines[j]);
                if (rtpmap.name == 'CN' || rtpmap.name == 'ISAC')
                    continue;
                mline.fmt.push(rtpmap.id);
                newdesc += lines[j] + '\r\n';
            } else {
                newdesc += lines[j] + '\r\n';
            }
        }
        this.media[i] = SDPUtil.build_mline(mline) + '\r\n';
        this.media[i] += newdesc;
    }
    this.raw = this.session + this.media.join('');
};

// remove lines matching prefix from session section
SDP.prototype.removeSessionLines = function(prefix) {
    var self = this;
    var lines = SDPUtil.find_lines(this.session, prefix);
    lines.forEach(function(line) {
        self.session = self.session.replace(line + '\r\n', '');
    });
    this.raw = this.session + this.media.join('');
    return lines;
}

// remove lines matching prefix from a media section specified by mediaindex
// TODO: non-numeric mediaindex could match mid
SDP.prototype.removeMediaLines = function(mediaindex, prefix) {
    var self = this;
    var lines = SDPUtil.find_lines(this.media[mediaindex], prefix);
    lines.forEach(function(line) {
        self.media[mediaindex] = self.media[mediaindex].replace(line + '\r\n', '');
    });
    this.raw = this.session + this.media.join('');
    return lines;
}

// add content's to a jingle element
SDP.prototype.toJingle = function(elem, thecreator, localStream) {
    var ssrcs = [];
    //    logger.log("SSRC" + ssrcs["audio"] + " - " + ssrcs["video"]);
    var self = this;
    var i, j, k, mline, ssrc, rtpmap, tmp, lines;
    // new bundle plan
    if (SDPUtil.find_line(this.session, 'a=group:')) {
        lines = SDPUtil.find_lines(this.session, 'a=group:');
        for (i = 0; i < lines.length; i++) {
            tmp = lines[i].split(' ');
            var semantics = tmp.shift().substr(8);
            elem = elem.c('group', { xmlns: 'urn:xmpp:jingle:apps:grouping:0', semantics: semantics });
            for (j = 0; j < tmp.length; j++) {
                elem = elem.c('content', { name: tmp[j] }).up();
            }
            elem = elem.up();
        }
    }
    for (i = 0; i < this.media.length; i++) {
        mline = SDPUtil.parse_mline(this.media[i].split('\r\n')[0]);
        if (!(mline.media === 'audio' ||
                mline.media === 'video' ||
                mline.media === 'application')) {
            continue;
        }
        if (SDPUtil.find_line(this.media[i], 'a=ssrc:')) {
            ssrc = SDPUtil.find_line(this.media[i], 'a=ssrc:').substring(7).split(' ')[0]; // take the first
        } else {
            if (ssrcs && ssrcs[mline.media]) {
                ssrc = ssrcs[mline.media];
            } else {
                ssrc = false;
            }
        }

        elem = elem.c('content', { creator: thecreator, name: mline.media });
        if (SDPUtil.find_line(this.media[i], 'a=mid:')) {
            // prefer identifier from a=mid if present
            var mid = SDPUtil.parse_mid(SDPUtil.find_line(this.media[i], 'a=mid:'));
            elem.attr("name", mid);
        }

        if (SDPUtil.find_line(this.media[i], 'a=rtpmap:').length) {
            elem = elem.c('description', {
                xmlns: 'urn:xmpp:jingle:apps:rtp:1',
                media: mline.media
            });
            if (ssrc) {
                elem.attr("ssrc", ssrc);
            }
            for (j = 0; j < mline.fmt.length; j++) {
                rtpmap = SDPUtil.find_line(this.media[i], 'a=rtpmap:' + mline.fmt[j]);
                if (!rtpmap) continue;
                elem = elem.c('payload-type', SDPUtil.parse_rtpmap(rtpmap));
                // put any 'a=fmtp:' + mline.fmt[j] lines into <param name=foo value=bar/>
                if (SDPUtil.find_line(this.media[i], 'a=fmtp:' + mline.fmt[j])) {
                    tmp = SDPUtil.parse_fmtp(SDPUtil.find_line(this.media[i], 'a=fmtp:' + mline.fmt[j]));
                    for (k = 0; k < tmp.length; k++) {
                        elem.c('parameter', {
                            'name': tmp[k].name,
                            'value': tmp[k].value
                        });
                    }
                }
                this.rtcpFbToJingle(i, elem, mline.fmt[j]); // XEP-0293 -- map a=rtcp-fb

                elem = elem.up();
            }
            if (SDPUtil.find_line(this.media[i], 'a=crypto:', this.session)) {
                elem = elem.c('encryption', { required: 1 });
                var crypto = SDPUtil.find_lines(this.media[i], 'a=crypto:', this.session);
                crypto.forEach(function(line) {
                    elem.c('crypto', SDPUtil.parse_crypto(line));
                });
                elem = elem.up(); // end of encryption
            }

            if (ssrc) {
                // new style mapping
                elem = elem.c('source', { ssrc: ssrc, xmlns: 'urn:xmpp:jingle:apps:rtp:ssma:0' });
                // FIXME: group by ssrc and support multiple different ssrcs
                var ssrclines = SDPUtil.find_lines(this.media[i], 'a=ssrc:');
                if (ssrclines.length > 0) {
                    ssrclines.forEach(function(line) {
                        var idx = line.indexOf(' ');
                        var linessrc = line.substr(0, idx).substr(7);
                        if (linessrc != ssrc) {
                            elem = elem.up();
                            ssrc = linessrc;
                            elem = elem.c('source', { ssrc: ssrc, xmlns: 'urn:xmpp:jingle:apps:rtp:ssma:0' });
                        }
                        var kv = line.substr(idx + 1);
                        elem = elem.c('parameter');
                        if (kv.indexOf(':') == -1) {
                            elem.attr("name", kv);
                        } else {
                            var k = kv.split(':', 2)[0];
                            elem.attr("name", k);

                            var v = kv.split(':', 2)[1];
                            v = SDPUtil.filter_special_chars(v);
                            elem.attr("value", v);
                        }
                        elem = elem.up();
                    });
                } else {
                    elem = elem.up();
                    elem = elem.c('source', { ssrc: ssrc, xmlns: 'urn:xmpp:jingle:apps:rtp:ssma:0' });
                    elem = elem.c('parameter');
                    elem.attr("name", "cname");
                    elem.attr("value", Math.random().toString(36).substring(7));
                    elem = elem.up();
                    var msid = null;
                    if (mline.media == "audio") {
                        localStream.getTracks().forEach(function(track) {

                            if (track.kind == "audio") {
                                msid = track.Id;
                            }

                            // logger.log(logger.level.VERBOSE, "IrisRtcSession", "Stream is successfully added to peerconnection ", track);
                        });
                        // msid = ;
                    } else {
                        localStream.getTracks().forEach(function(track) {

                            if (track.kind == "video") {
                                msid = track.Id;
                            }

                            // logger.log(logger.level.VERBOSE, "IrisRtcSession", "Stream is successfully added to peerconnection ", track);
                        });
                        // msid = APP.RTC.localVideo.getId();
                    }
                    if (msid != null) {
                        msid = SDPUtil.filter_special_chars(msid);
                        elem = elem.c('parameter');
                        elem.attr("name", "msid");
                        elem.attr("value", msid);
                        elem = elem.up();
                        elem = elem.c('parameter');
                        elem.attr("mslabel", "msid");
                        elem.attr("value", msid);
                        elem = elem.up();
                        elem = elem.c('parameter');
                        elem.attr("label", "msid");
                        elem.attr("value", msid);
                        elem = elem.up();
                    }
                }
                elem = elem.up();

                // XEP-0339 handle ssrc-group attributes
                var ssrc_group_lines = SDPUtil.find_lines(this.media[i], 'a=ssrc-group:');
                ssrc_group_lines.forEach(function(line) {
                    var idx = line.indexOf(' ');
                    var semantics = line.substr(0, idx).substr(13);
                    var ssrcs = line.substr(14 + semantics.length).split(' ');
                    if (ssrcs.length) {
                        elem = elem.c('ssrc-group', { semantics: semantics, xmlns: 'urn:xmpp:jingle:apps:rtp:ssma:0' });
                        ssrcs.forEach(function(ssrc) {
                            elem.c('source', { ssrc: ssrc });
                        });
                        elem = elem.up();
                    }
                });
            }

            if (SDPUtil.find_line(this.media[i], 'a=rtcp-mux')) {
                elem.c('rtcp-mux');
            }

            // XEP-0293 -- map a=rtcp-fb:*
            this.rtcpFbToJingle(i, elem, '*');

            // XEP-0294
            if (SDPUtil.find_line(this.media[i], 'a=extmap:')) {
                lines = SDPUtil.find_lines(this.media[i], 'a=extmap:');
                for (j = 0; j < lines.length; j++) {
                    tmp = SDPUtil.parse_extmap(lines[j]);
                    elem = elem.c('rtp-hdrext', {
                        xmlns: 'urn:xmpp:jingle:apps:rtp:rtp-hdrext:0',
                        uri: tmp.uri,
                        id: tmp.value
                    });
                    if (tmp.hasOwnProperty('direction')) {
                        switch (tmp.direction) {
                            case 'sendonly':
                                elem.attr("senders", 'responder');
                                break;
                            case 'recvonly':
                                elem.attr("senders", 'initiator');
                                break;
                            case 'sendrecv':
                                elem.attr("senders", 'both');
                                break;
                            case 'inactive':
                                elem.attr("senders", 'none');
                                break;
                        }
                    }
                    // TODO: handle params
                    elem = elem.up();
                }
            }
            elem = elem.up(); // end of description
        }

        // map ice-ufrag/pwd, dtls fingerprint, candidates
        this.transportToJingle(i, elem);

        if (SDPUtil.find_line(this.media[i], 'a=sendrecv', this.session)) {
            elem.attr("senders", 'both');
        } else if (SDPUtil.find_line(this.media[i], 'a=sendonly', this.session)) {
            elem.attr("senders", 'initiator');
        } else if (SDPUtil.find_line(this.media[i], 'a=recvonly', this.session)) {
            elem.attr("senders", 'responder');
        } else if (SDPUtil.find_line(this.media[i], 'a=inactive', this.session)) {
            elem.attr("senders", 'none');
        }
        if (mline.port == '0') {
            // estos hack to reject an m-line
            //elem.attr("senders",  'rejected');
        }
        elem = elem.up(); // end of content
    }
    elem = elem.up();
    return elem;
};

SDP.prototype.transportToJingle = function(mediaindex, elem) {
    var tmp, sctpmap, sctpAttrs, fingerprints;
    var self = this;
    elem = elem.c('transport');

    // XEP-0343 DTLS/SCTP
    if (SDPUtil.find_line(this.media[mediaindex], 'a=sctpmap:').length) {
        sctpmap = SDPUtil.find_line(
            this.media[mediaindex], 'a=sctpmap:', self.session);
        if (sctpmap) {
            sctpAttrs = SDPUtil.parse_sctpmap(sctpmap);
            elem = elem.c('sctpmap', {
                xmlns: 'urn:xmpp:jingle:transports:dtls-sctp:1',
                number: sctpAttrs[0],
                /* SCTP port */
                protocol: sctpAttrs[1] /* protocol */
            });
            // Optional stream count attribute
            if (sctpAttrs.length > 2)
                elem.attr("streams", sctpAttrs[2]);
            elem = elem.up();
        }
    }
    // XEP-0320
    fingerprints = SDPUtil.find_lines(this.media[mediaindex], 'a=fingerprint:', this.session);
    fingerprints.forEach(function(line) {
        tmp = SDPUtil.parse_fingerprint(line);
        tmp.xmlns = 'urn:xmpp:jingle:apps:dtls:0';
        elem = elem.c('fingerprint');
        elem.t(tmp.fingerprint);
        delete tmp.fingerprint;
        line = SDPUtil.find_line(self.media[mediaindex], 'a=setup:', self.session);
        if (line) {
            tmp.setup = line.substr(8);
        }

        for (var key in tmp) {
            elem.attr(key, tmp[key]);
        }

        elem = elem.up(); // end of fingerprint
    });
    tmp = SDPUtil.iceparams(this.media[mediaindex], this.session);
    if (tmp) {
        tmp.xmlns = 'urn:xmpp:jingle:transports:ice-udp:1';
        for (var key in tmp) {
            elem.attr(key, tmp[key]);
        }

        // XEP-0176
        if (SDPUtil.find_line(this.media[mediaindex], 'a=candidate:', this.session)) { // add any a=candidate lines
            var lines = SDPUtil.find_lines(this.media[mediaindex], 'a=candidate:', this.session);
            lines.forEach(function(line) {
                var candidate = SDPUtil.candidateToJingle(line);
                var protocol = (candidate &&
                        typeof candidate.protocol === 'string') ?
                    candidate.protocol.toLowerCase() : '';
                if ((self.removeTcpCandidates && protocol === 'tcp') ||
                    (self.removeUdpCandidates && protocol === 'udp')) {
                    return;
                }
                elem.c('candidate', candidate);
            });
        }
    }
    elem.up(); // end of transport
}

SDP.prototype.rtcpFbToJingle = function(mediaindex, elem, payloadtype) { // XEP-0293
    var lines = SDPUtil.find_lines(this.media[mediaindex], 'a=rtcp-fb:' + payloadtype);
    lines.forEach(function(line) {
        var tmp = SDPUtil.parse_rtcpfb(line);
        if (tmp.type == 'trr-int') {
            elem.c('rtcp-fb-trr-int', { xmlns: 'urn:xmpp:jingle:apps:rtp:rtcp-fb:0', value: tmp.params[0] });
            elem.up();
        } else {
            elem.c('rtcp-fb', { xmlns: 'urn:xmpp:jingle:apps:rtp:rtcp-fb:0', type: tmp.type });
            if (tmp.params.length > 0) {
                elem.attr('subtype', tmp.params[0]);
            }
            elem.up();
        }
    });
};

SDP.prototype.rtcpFbFromJingle = function(elem, payloadtype) { // XEP-0293
    var media = '';

    var tmp = elem.getChild('rtcp-fb-trr-int', 'urn:xmpp:jingle:apps:rtp:rtcp-fb:0');
    if (tmp) {
        media += 'a=rtcp-fb:' + '*' + ' ' + 'trr-int' + ' ';
        if (tmp.attr('value')) {
            media += tmp.attr('value');
        } else {
            media += '0';
        }
        media += '\r\n';
    }
    tmp = elem.getChildren("rtcp-fb", "urn:xmpp:jingle:apps:rtp:rtcp-fb:0");
    tmp.forEach(function(element) {
        media += 'a=rtcp-fb:' + payloadtype + ' ' + element.attrs.type;
        if (element.attrs.subtype) {
            media += ' ' + element.attrs.subtype;
        }
        media += '\r\n';
    });
    return media;
};

// construct an SDP from a jingle stanza
SDP.prototype.fromJingle = function(jingle) {
    var self = this;
    this.raw = 'v=0\r\n' +
        'o=- 1923518516 2 IN IP4 0.0.0.0\r\n' + // FIXME
        's=-\r\n' +
        't=0 0\r\n';
    // http://tools.ietf.org/html/draft-ietf-mmusic-sdp-bundle-negotiation-04#section-8

    // Find the children with xmlns "urn:xmpp:jingle:apps:grouping:0" and name "group"
    var groups = jingle.getChildrenByAttr("xmlns", "urn:xmpp:jingle:apps:grouping:0", null, true);
    var contents = [];
    if (groups.length > 0) {
        // Traverse through the group
        groups.forEach(function(group) {
            group.children.forEach(function(content) {
                contents.push(content.attrs.name);
            });
            self.raw += 'a=group:' + (group.attrs.semantics || group.attrs.type) + ' ' + contents.join(' ') + '\r\n';
        });
    } else {
        contents.push("audio");
        contents.push("video");
        contents.push("data");
    }
    this.session = this.raw;

    // Find the children with xmlns "urn:xmpp:jingle:apps:grouping:0" and name "content"
    contents.forEach(function(contentName) {
        jingle.getChildrenByAttr("name", contentName, null, true).forEach(function(content) {
            // If no children, this is just the name
            if (content.children.length) {
                var m = self.jingle2media(content);
                self.media.push(m);
            }
        });
    });
    /*jingle.getChildrenByFilter(function(child) 
            {
                if (child.name === "content" && 
                    child.attrs.xmlns != "urn:xmpp:jingle:apps:grouping:0") 
                    return true;
                return false;
            }, true).forEach(function(content){
       var m = self.jingle2media(content);
        self.media.push(m);
   });*/


    // reconstruct msid-semantic -- apparently not necessary
    /*
     var msid = SDPUtil.parse_ssrc(this.raw);
     if (msid.hasOwnProperty('mslabel')) {
     this.session += "a=msid-semantic: WMS " + msid.mslabel + "\r\n";
     }
     */

    this.raw = this.session + this.media.join('');
};

// Add sources
/*
<jingle xmlns="urn:xmpp:jingle:1" action="source-add" sid="bbfhnn3q3a10a"><content name="video">
<description xmlns="urn:xmpp:jingle:apps:rtp:1" media="video">
<source xmlns="urn:xmpp:jingle:apps:rtp:ssma:0" ssrc="3309936399">
<parameter value="VlZJDCfdylJoifY" name="cname"/>
<parameter value="stream video" name="msid"/>
<parameter value="stream" name="mslabel"/>
<parameter value="video" name="label"/>
<ssrc-info xmlns="http://jitsi.org/jitmeet" owner="aceea565-bd5d-11e6-a05f-0242ac110002@sdk-conference-wcdc-c-001.rtc.sys.comcast.net/3c27c165-ac38-11e6-b096-0242ac110002@irisconnect.comcast.com/0df540ff-972d-4279-872c-6c0e2c2fc651"/></source></description></content></jingle>
*/
SDP.prototype.addSources = function(jingle) {

    var addSourceInfo = [];
    // Get the contents
    var contents = jingle.getChildren('content');
    var self = this;
    // Go through all the contents
    contents.forEach(function(content, idx) {
        var lines = '';
        var name = content.attrs.name;

        // Get the description
        desc = content.getChild('description');
        if (desc == null) return;

        // XEP-0339 handle ssrc-group attributes
        desc.getChildren("ssrc-group", "urn:xmpp:jingle:apps:rtp:ssma:0").forEach(function(ssrc) {
            var semantics = ssrc.attrs.semantics;
            var ssrcs = ssrc.getChildren('source').map(function(key, value) {
                return key.attrs.ssrc;
            });

            if (ssrcs.length) {
                lines += 'a=ssrc-group:' + semantics + ' ' + ssrcs.join(' ') + '\r\n';
            }
        });

        desc.getChildren("source", "urn:xmpp:jingle:apps:rtp:ssma:0").forEach(function(source) {

            var ssrc = source.attrs.ssrc;
            if (self.containsSSRC(ssrc)) {
                logger.log(logger.level.INFO, "SDP.addSources", "Source-add request for existing SSRC: " + ssrc);
                return;
            }
            var msidCount = 0;
            source.getChildren('parameter').forEach(function(parameter) {
                if (parameter.attrs.name == "msid") {
                    msidCount = msidCount + 1;
                }
            });

            if (msidCount == 0) {
                logger.log(logger.level.INFO, "SDP.addSources", "Remove ssrcs without msid");
                //Don't set ssrc without msid
            } else {
                source.getChildren('parameter').forEach(function(parameter) {
                    var name = parameter.attrs.name;
                    var value = parameter.attrs.value;
                    value = SDPUtil.filter_special_chars(value);
                    lines += 'a=ssrc:' + ssrc + ' ' + name;
                    if (value && value.length)
                        lines += ':' + value;
                    lines += '\r\n';
                });
            }

            // source.getChildren('parameter').forEach(function(parameter) {
            //     var name = parameter.attrs.name;
            //     var value = parameter.attrs.value;
            //     value = SDPUtil.filter_special_chars(value);
            //     lines += 'a=ssrc:' + ssrc + ' ' + name;
            //     if (value && value.length)
            //         lines += ':' + value;
            //     lines += '\r\n';
            // });
        });

        if (lines) {
            // Go through the media lines
            self.media.forEach(function(medialines, idx) {
                if (!SDPUtil.find_lines(medialines, 'a=mid:' + name).length)
                    return;

                if (!addSourceInfo[idx])
                    addSourceInfo[idx] = '';

                addSourceInfo[idx] += lines;

            });
        }

    });

    // Go through the media lines
    addSourceInfo.forEach(function(medialines, idx) {
        self.media[idx] += medialines;
    });

    self.raw = self.session + self.media.join('');
}


/*

<?xml version="1.0" encoding="UTF-8"?>
<iq id="cHl3b2huc3Ytc3ZrNC1iYmx1LTVqdXYtYmpnOWRoZGtpa0BpcmlzdGVzdC5jb21jYXN0LmNvbS8wYTc3NGY1MC0zYTEyLTQ2NDktOTMwOS05MDY0MzI2NTNiMjcAQ1JYbTgtMjE1ODUyAAmjOYUSjkH11fNWeL9o0yQ=" type="set" to="pywohnsv-svk4-bblu-5juv-bjg9dhdkik@iristest.comcast.com/0a774f50-3a12-4649-9309-906432653b27" from="438d4c8d-1323-11e7-8485-0242ac110002@pr-conference-as-b-001.rtc.sys.comcast.net/xrtc_sp00f_f0cus">
   <jingle xmlns="urn:xmpp:jingle:1" action="source-remove" sid="8b97uhnj6gm4m">
      <content name="data">
         <description xmlns="urn:xmpp:jingle:apps:rtp:1" media="data" />
      </content>
      <content name="audio">
         <description xmlns="urn:xmpp:jingle:apps:rtp:1" media="audio">
            <source xmlns="urn:xmpp:jingle:apps:rtp:ssma:0" ssrc="3119997050">
               <ssrc-info xmlns="http://jitsi.org/jitmeet" owner="438d4c8d-1323-11e7-8485-0242ac110002@pr-conference-as-b-001.rtc.sys.comcast.net/d3jcq7q0-vq98-9qq2-74cp-1nqmr0k8lc6i@iristest.comcast.com/86eca7cf-c62d-4154-8472-e73bad1b1c41" />
            </source>
         </description>
      </content>
      <content name="video">
         <description xmlns="urn:xmpp:jingle:apps:rtp:1" media="video">
            <source xmlns="urn:xmpp:jingle:apps:rtp:ssma:0" ssrc="3133057094">
               <ssrc-info xmlns="http://jitsi.org/jitmeet" owner="438d4c8d-1323-11e7-8485-0242ac110002@pr-conference-as-b-001.rtc.sys.comcast.net/d3jcq7q0-vq98-9qq2-74cp-1nqmr0k8lc6i@iristest.comcast.com/86eca7cf-c62d-4154-8472-e73bad1b1c41" />
            </source>
            <source xmlns="urn:xmpp:jingle:apps:rtp:ssma:0" ssrc="836497850">
               <ssrc-info xmlns="http://jitsi.org/jitmeet" owner="438d4c8d-1323-11e7-8485-0242ac110002@pr-conference-as-b-001.rtc.sys.comcast.net/d3jcq7q0-vq98-9qq2-74cp-1nqmr0k8lc6i@iristest.comcast.com/86eca7cf-c62d-4154-8472-e73bad1b1c41" />
            </source>
            <ssrc-group xmlns="urn:xmpp:jingle:apps:rtp:ssma:0" semantics="FID">
               <source ssrc="3133057094" />
               <source ssrc="836497850" />
            </ssrc-group>
         </description>
      </content>
   </jingle>
   <data xmlns="urn:xmpp:comcast:info" traceid="afe891d0-2d44-11e7-a255-d94badd787cb" />
</iq>
*/
SDP.prototype.removeSources = function(jingle, remoteDesc) {

    // Get the contents
    var contents = jingle.getChildren('content');
    var self = this;
    var lines = '';

    // Go through all the contents
    contents.forEach(function(content, idx) {
        var name = content.attrs.name;

        // Get the description
        desc = content.getChild('description');
        if (desc == null) return;

        // XEP-0339 handle ssrc-group attributes
        desc.getChildren("ssrc-group", "urn:xmpp:jingle:apps:rtp:ssma:0").forEach(function(ssrc) {
            var semantics = ssrc.attrs.semantics;
            var ssrcs = ssrc.getChildren('source').map(function(key, value) {
                return key.attrs.ssrc;
            });

            if (ssrcs.length) {
                lines += 'a=ssrc-group:' + semantics + ' ' + ssrcs.join(' ') + '\r\n';
            }
        });

        desc.getChildren("source", "urn:xmpp:jingle:apps:rtp:ssma:0").forEach(function(source) {
            var ssrc = source.attrs.ssrc;
            // if (self.containsSSRC(ssrc)) {
            //     logger.log(logger.level.INFO, "Source-add request for existing SSRC: " + ssrc);
            //     return;
            // }
            source.getChildren('parameter').forEach(function(parameter) {
                var name = parameter.attrs.name;
                var value = parameter.attrs.value;
                value = SDPUtil.filter_special_chars(value);
                lines += 'a=ssrc:' + ssrc + ' ' + name;
                if (value && value.length)
                    lines += ':' + value;
                lines += '\r\n';
            });
        });

    });


    // // Go through the media lines
    // self.media.forEach(function(medialines, idx) {
    //     if (!SDPUtil.find_lines(medialines, 'a=mid:' + name).length)
    //         return;
    //     // Let's remove the old ssrc
    //     //self.media[idx] = self.media[idx].replace(/\na=ssrc:(.*?)\r/mg, '');
    //     self.media[idx] += lines;
    // });

    var removessrc = [];

    // Collect sources to be removed
    self.media.forEach(function(media, idx) {
        if (!SDPUtil.find_line(media, 'a=mid:' + name))
            return;
        self.media[idx] += lines;
        if (!removessrc[idx])
            removessrc[idx] = '';
        removessrc[idx] += lines;
    });

    // remove sources
    removessrc.forEach(function(lines, idx) {
        lines = lines.split('\r\n');
        lines.pop(); // remove empty last element;
        lines.forEach(function(line) {
            remoteDesc.media[idx] = remoteDesc.media[idx].replace(line + '\r\n', '');
        });
    });

    remoteDesc.raw = remoteDesc.session + remoteDesc.media.join('');

    return remoteDesc;
}


// translate a jingle content element into an an SDP media part
SDP.prototype.jingle2media = function(content) {
    var media = '',
        desc = content.getChild('description'),
        self = this,
        tmp = [];
    var sctp = content.getChildByAttr("xmlns", "urn:xmpp:jingle:transports:dtls-sctp:1", null, true);

    tmp.media = desc.attrs.media;
    tmp.port = '1';
    if (content.attrs.senders == 'rejected') {
        // estos hack to reject an m-line.
        tmp.port = '0';
    }

    // Get the transport element
    var transport = content.getChild('transport');

    // Check if the transport element has fingerprint
    if (transport.getChild('fingerprint')) {
        // Check if we have sctp element
        if (sctp)
            tmp.proto = 'DTLS/SCTP';
        else
            tmp.proto = 'RTP/SAVPF';
    } else {
        tmp.proto = 'RTP/AVPF';
    }

    if (!sctp) {
        // Get all the payload elements
        var payloads = [];
        // Search for all payload types
        payloads = desc.getChildrenByFilter(function(element) {
            if (element.name === 'payload-type') return true;
            return false;
        }, true);

        tmp.fmt = [];
        // Get the payload ids
        payloads.forEach(function(payload) {
            tmp.fmt.push(payload.attrs.id);
        });

        // Build the mline
        media += SDPUtil.build_mline(tmp) + '\r\n';
    } else {
        if (sctp.attrs.number && sctp.attrs.protocol) {
            media += 'm=application 1 DTLS/SCTP ' + sctp.attrs.number + '\r\n';
            media += 'a=sctpmap:' + sctp.attrs.number +
                ' ' + sctp.attrs.protocol;
        }

        var streamCount = sctp.attrs.streams;
        if (streamCount)
            media += ' ' + streamCount + '\r\n';
        else
            media += '\r\n';
    }

    media += 'c=IN IP4 0.0.0.0\r\n';
    if (!sctp)
        media += 'a=rtcp:1 IN IP4 0.0.0.0\r\n';

    // Find the transport udp
    tmp = content.getChildByAttr("xmlns", "urn:xmpp:jingle:transports:ice-udp:1", null, true);

    if (tmp) {
        if (tmp.attrs.ufrag) {
            media += SDPUtil.build_iceufrag(tmp.attrs.ufrag) + '\r\n';
        }
        if (tmp.attrs.pwd) {
            media += SDPUtil.build_icepwd(tmp.attrs.pwd) + '\r\n';
        }
        tmp.getChildren('fingerprint').forEach(function(element) {
            // FIXME: check namespace at some point
            media += 'a=fingerprint:' + element.attrs.hash;
            media += ' ' + element.getText();
            media += '\r\n';
            if (element.attrs.setup) {
                media += 'a=setup:' + element.attrs.setup + '\r\n';
            }
        });
    }
    switch (content.attrs.senders) {
        case 'initiator':
            media += 'a=sendonly\r\n';
            break;
        case 'responder':
            media += 'a=recvonly\r\n';
            break;
        case 'none':
            media += 'a=inactive\r\n';
            break;
        case 'both':
            media += 'a=sendrecv\r\n';
            break;
    }
    media += 'a=mid:' + content.attrs.name + '\r\n';

    // <description><rtcp-mux/></description>
    // see http://code.google.com/p/libjingle/issues/detail?id=309 -- no spec though
    // and http://mail.jabber.org/pipermail/jingle/2011-December/001761.html
    if (desc.getChildren('rtcp-mux').length) {
        media += 'a=rtcp-mux\r\n';
    }

    if (desc.getChildren('encryption').length) {
        desc.getChildren('encryption').getChildren('crypto').forEach(function(element) {
            media += 'a=crypto:' + element.attrs.tag;
            media += ' ' + element.attrs.crypto - suite;
            media += ' ' + element.attrs.key - params;
            if (element.attrs.session - params) {
                media += ' ' + element.attrs.session - params;
            }
            media += '\r\n';
        });
    }
    desc.getChildren('payload-type').forEach(function(element) {
        media += SDPUtil.build_rtpmap(element) + '\r\n';
        if (element.getChildren('parameter').length) {
            media += 'a=fmtp:' + element.attrs.id + ' ';
            media += element.getChildren('parameter').map(function(el) {
                return (el.attrs.name) ?
                    (el.attrs.name + '=' + el.attrs.value) : '' + el.attrs.value;
            }).join('; ');
            media += '\r\n';
        }
        // xep-0293
        media += self.rtcpFbFromJingle(element, element.attrs.id);
    });

    // xep-0293
    media += self.rtcpFbFromJingle(desc, '*');

    // xep-0294
    tmp = desc.getChildrenByAttr("xmlns", "urn:xmpp:jingle:apps:rtp:rtp-hdrext:0", null, true);

    // RTP header
    tmp.forEach(function(rtpHeader) {
        media += 'a=extmap:' + rtpHeader.attrs.id + ' ' + rtpHeader.attrs.uri + '\r\n';
    });

    // Get the candidates
    var iceCandidates = content.getChildByAttr("xmlns", "urn:xmpp:jingle:transports:ice-udp:1", null, true);
    if (iceCandidates) {
        iceCandidates.getChildren("candidate").forEach(function(candidate) {
            var protocol = candidate.attrs.protocol;
            protocol = (typeof protocol === 'string') ? protocol.toLowerCase() : '';

            if ((self.removeTcpCandidates && protocol === 'tcp') ||
                (self.removeUdpCandidates && protocol === 'udp')) {
                return;
            }

            media += SDPUtil.candidateFromJingle(candidate);
        });
    }

    // XEP-0339 handle ssrc-group attributes
    desc.getChildren("ssrc-group", "urn:xmpp:jingle:apps:rtp:ssma:0").forEach(function(ssrc) {
        var semantics = ssrc.attrs.semantics;
        var ssrcs = ssrc.getChildren('source').map(function(key, value) {
            return key.attrs.ssrc;
        });

        if (ssrcs.length) {
            media += 'a=ssrc-group:' + semantics + ' ' + ssrcs.join(' ') + '\r\n';
        }
    });

    desc.getChildren("source", "urn:xmpp:jingle:apps:rtp:ssma:0").forEach(function(source) {
        var ssrc = source.attrs.ssrc;


        var msidCount = 0;
        source.getChildren('parameter').forEach(function(parameter) {
            if (parameter.attrs.name == "msid") {
                msidCount = msidCount + 1;
            }
        });

        if (msidCount == 0) {

            logger.log(logger.level.INFO, "SDP.sessionInitiate", "Remove ssrc without msid");

            //Don't set ssrc without msid
        } else {
            source.getChildren('parameter').forEach(function(parameter) {
                var name = parameter.attrs.name;
                var value = parameter.attrs.value;
                value = SDPUtil.filter_special_chars(value);
                media += 'a=ssrc:' + ssrc + ' ' + name;
                if (value && value.length)
                    media += ':' + value;
                media += '\r\n';
            });
        }

        // source.getChildren('parameter').forEach(function(parameter) {
        //     var name = parameter.attrs.name;
        //     var value = parameter.attrs.value;
        //     value = SDPUtil.filter_special_chars(value);
        //     media += 'a=ssrc:' + ssrc + ' ' + name;
        //     if (value && value.length)
        //         media += ':' + value;
        //     media += '\r\n';
        // });


    });

    return media;
};


module.exports = SDP;
