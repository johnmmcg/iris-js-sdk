// Copyright 2018 Comcast Cable Communications Management, LLC

// ModeratorControls.js : Javascript code for handling Moderator Privileges 

module.exports = ModeratorControls;


var logger = require('../RtcLogger.js');
var RtcErrors = require('../RtcErrors.js');


/**
 * Constructor for ModeratorControls.</br>
 * Includes API calls for Admin controls in a given session. Where Admin can 
 * Kick Participants, lock and unlock room, grant moderator priveleges to other participants in room.
 * 
 * @example
 * //This is available as an object from session. 
 * Note :: Admin object will be null for non-admin particpants
 * irisRtcSession.admin
 * 
 * @constructor
 */
function ModeratorControls(session) {

    this.session = session;

    if (!session || !session.config || !session.connection)
        return;

}

/**
 * This API is called when an occupant needs to be kicked out of the current session, 
 * Kicked out occupant won't be able to rejoin during the current session.
 * Only a Admin is allowed to kick other participants out of the room and he can't kick himself
 * @example
 * // Should use 'admin' object from irisRtcSession to call this API, Only session Admin can call this API
 * irisRtcSession.admin.kickParticipant(roomId, participantJid);
 * 
 * @param {string} roomId           - (MANDATORY) Room Id
 * @param {string} participantJid   - (MANDATORY) Jid of the participant to be kicked out of the room
 * @public
 */
ModeratorControls.prototype.kickParticipant = function(roomId, participantJid) {

    try {

        logger.log(logger.level.INFO, "ModeratorControls", "kickParticipant :: " + participantJid);

        if (!roomId || !participantJid || (participantJid == this.session.connection.myJid)) {
            this.session.onSessionError(this.session.config ? this.session.config.roomId : "RoomId", RtcErrors.ERR_API_PARAMETERS,
                "kickParticipant :: Invalid parameters")
            return;
        }

        if (roomId != this.session.config.roomId) {
            logger.log(logger.level.ERROR, "ModeratorControls", "kickParticipant :: Wrong roomId, this roomId : " +
                this.session.config.roomId + " Received roomId : " + roomId)
            this.session.onSessionError(this.session.config.roomId, RtcErrors.ERR_API_PARAMETERS,
                "kickParticipant :: Invalid parameters")
            return;
        }

        if (this.session.myRole && this.session.myRole == "moderator" && this.session.myAffiliation && this.session.myAffiliation == "owner") {
            this.session.connection.xmpp.kickParticipant(this.session.config, participantJid);

        } else {
            this.session.onSessionError(this.session.config ? this.session.config.roomId : "RoomId", RtcErrors.ERR_SESSION_NO_ADMIN_PRIVILEGE,
                "You don't have privilege to kick participants");
        }
    } catch (error) {
        logger.log(logger.level.ERROR, "ModeratorControls", "kickParticipant :: Failed to kick participant", error);
    }

}

/**
 * This API is called to lock the room with exitsing number of participants in an ongoing sesison.
 * Once room is locked no new participants are allowed to join the room.
 * 
 * During a session if any participant gets disconnected because of some reason, moderator can 
 * control whether or not disconnected participant to be allowed to join the room again by setting rejoin 
 * attribute to true/false while calling this API.
 * 
 * Only a Admin can lock the room.
 * 
 * @example
 * // Should use 'admin' object from irisRtcSession to call this API
 * irisRtcSession.admin.lockRoom(roomId, rejoin);
 * 
 * @param {string} roomId   - (MANDATORY) Room ID of the session to locked
 * @param {boolean} rejoin  - (MANDATORY) true for allowing abruptly disconnected participants to rejoin a locked room.</br>
 *                                        false for restricting abruptly disconnected participants to rejoin a locked room.
 * @public
 */
ModeratorControls.prototype.lockRoom = function(roomId, rejoin) {

    try {

        var self = this;

        logger.log(logger.level.INFO, "ModeratorControls", "lockRoom :: " + roomId + " rejoin : " + rejoin);

        if (!roomId) {
            this.session.onSessionError(this.session.config ? this.session.config.roomId : "RoomId", RtcErrors.ERR_API_PARAMETERS,
                "lockRoom :: Invalid parameters")
            return;
        }

        if (roomId != this.session.config.roomId) {
            logger.log(logger.level.ERROR, "ModeratorControls", "lockRoom :: Wrong roomId, this roomId : " +
                this.session.config.roomId + " Received roomId : " + roomId)
            this.session.onSessionError(this.session.config.roomId, RtcErrors.ERR_API_PARAMETERS,
                "lockRoom :: Invalid parameters")
            return;
        }

        if (this.session.myAffiliation && this.session.myAffiliation == "owner") {

            this.session.config.rejoin = rejoin;

            this.session.connection.xmpp.lockRoom(this.session.config);

        } else {
            this.session.onSessionError(this.session.config ? this.session.config.roomId : "RoomId", RtcErrors.ERR_SESSION_NO_ADMIN_PRIVILEGE,
                "You don't have privilege to lock room");
        }
    } catch (error) {
        logger.log(logger.level.ERROR, "ModeratorControls", "lockRoom :: Failed to lock room", error);
    }

}

/**
 * This API is called to unlock the already locked room, Once room is unlocked new participants can join the room.
 * Only Admin can unlock the room
 * 
 * @example
 * // Should use 'admin' object from irisRtcSession to call this API
 * irisRtcSession.admin.unlockRoom(roomId);
 * 
 * @param {string} roomId   - (MANDATORY) Room Id of the session to be unlocked
 * @public
 */
ModeratorControls.prototype.unlockRoom = function(roomId) {

    try {
        var self = this;

        logger.log(logger.level.INFO, "ModeratorControls", "unlockRoom :: " + roomId);

        if (!roomId) {
            this.session.onSessionError(this.session.config ? this.session.config.roomId : "RoomId", RtcErrors.ERR_API_PARAMETERS,
                "unlockRoom :: Invalid parameters")
            return;
        }

        if (roomId != this.session.config.roomId) {
            logger.log(logger.level.ERROR, "ModeratorControls", "unlockRoom :: Wrong roomId, this roomId : " +
                this.session.config.roomId + " Received roomId : " + roomId)
            this.session.onSessionError(this.session.config.roomId, RtcErrors.ERR_API_PARAMETERS,
                "unlockRoom :: Invalid parameters")
            return;
        }

        if (this.session.myAffiliation && this.session.myAffiliation == "owner") {
            this.session.connection.xmpp.unlockRoom(this.session.config);

        } else {
            this.session.onSessionError(this.session.config ? this.session.config.roomId : "RoomId", RtcErrors.ERR_SESSION_NO_ADMIN_PRIVILEGE,
                "You don't have privilege to unlock room");
        }
    } catch (error) {
        logger.log(logger.level.ERROR, "ModeratorControls", "unlockRoom :: Failed to unlock room ", error);
    }

}

/**
 * This API is called to give moderator privilege to other participants.
 * Only a Moderator with affiliation as owner can call this API
 * 
 * @example
 * // Should use 'admin' object from irisRtcSession to call this API
 * irisRtcSession.admin.grantModeratorPrivilege(roomId, participantJid);
 * 
 * @param {string} roomId                           - (MANDATORY) Room Id
 * @param {string} participantJid                   - (MANDATORY) Participant jid to whom moderator privilege is given
 * @param {json} moderatorRights                    - (MANDATORY) Moderator rights to be given to others
 * @param {boolean} moderatorRights.screenShare     - (OPTIONAL) true if admin is granting moderator privilege.
 * @public
 */
ModeratorControls.prototype.grantModeratorPrivilege = function(roomId, participantJid, moderatorRights) {

    try {
        var self = this;

        logger.log(logger.level.INFO, "ModeratorControls", "grantModeratorPrivilege :: " + roomId + " participantJid : " + participantJid);

        if (!roomId) {
            this.session.onSessionError(this.session.config ? this.session.config.roomId : "RoomId", RtcErrors.ERR_API_PARAMETERS,
                "grantModeratorPrivilege :: Invalid parameters")
            return;
        }

        if (roomId != this.session.config.roomId) {
            logger.log(logger.level.ERROR, "ModeratorControls", "grantModeratorPrivilege :: Wrong roomId, this roomId : " +
                this.session.config.roomId + " Received roomId : " + roomId)
            this.session.onSessionError(this.session.config.roomId, RtcErrors.ERR_API_PARAMETERS,
                "grantModeratorPrivilege :: Invalid parameters")
            return;
        }

        if (this.session.myRole && this.session.myRole == "moderator" && this.session.myAffiliation && this.session.myAffiliation == "owner") {

            this.session.moderatorRights = moderatorRights;

            if (moderatorRights && moderatorRights.screenShare) {
                this.session.connection.xmpp.grantModeratorPrivilege(this.session.config, participantJid);
            }

        } else {
            this.session.onSessionError(this.session.config ? this.session.config.roomId : "RoomId", RtcErrors.ERR_SESSION_NO_ADMIN_PRIVILEGE,
                "You don't have privilege to grant Moderator Privilege to others");
        }
    } catch (error) {
        logger.log(logger.level.ERROR, "ModeratorControls", "grantModeratorPrivilege :: Failed to grant privelege to other participant ", error);
    }
}

/**
 * This API is called to revoke moderator privilege from other participants.
 * Only a Admin with affiliation as owner can call this API
 * 
 * @example
 * // Should use 'admin' object from irisRtcSession to call this API
 * irisRtcSession.admin.revokeModeratorPrivilege(roomId, participantJid);
 * 
 * @param {string} roomId                           - (MANDATORY) Room Id
 * @param {string} participantJid                   - (MANDATORY) Jid of participant whose moderator privilege is being revoked
 * @param {json} moderatorRights                    - (MANDATORY) Moderator rights to be revoked to others
 * @param {boolean} moderatorRights.screenShare     - (OPTIONAL) false if admin is revoking moderator privilege.
 * @public
 */
ModeratorControls.prototype.revokeModeratorPrivilege = function(roomId, participantJid, moderatorRights) {

    try {
        var self = this;

        logger.log(logger.level.INFO, "ModeratorControls", "revokeModeratorPrivilege :: " + roomId + " participantJid : " + participantJid);

        if (!roomId) {
            this.session.onSessionError(this.session.config ? this.session.config.roomId : "RoomId", RtcErrors.ERR_API_PARAMETERS,
                "revokeModeratorPrivilege :: Invalid parameters")
            return;
        }

        if (roomId != this.session.config.roomId) {
            logger.log(logger.level.ERROR, "ModeratorControls", "revokeModeratorPrivilege :: Wrong roomId, this roomId : " +
                this.session.config.roomId + " Received roomId : " + roomId)
            this.session.onSessionError(this.session.config.roomId, RtcErrors.ERR_API_PARAMETERS,
                "revokeModeratorPrivilege :: Invalid parameters")
            return;
        }

        if (this.session.myRole && this.session.myRole == "moderator" && this.session.myAffiliation && this.session.myAffiliation == "owner") {

            this.session.moderatorRights = moderatorRights;
            if (moderatorRights && !moderatorRights.screenShare) {
                this.session.connection.xmpp.revokeModeratorPrivilege(this.session.config, participantJid);
            }

        } else {
            this.session.onSessionError(this.session.config ? this.session.config.roomId : "RoomId", RtcErrors.ERR_SESSION_NO_ADMIN_PRIVILEGE,
                "You don't have privilege to revoke moderator privilege to others");
        }
    } catch (error) {
        logger.log(logger.level.ERROR, "ModeratorControls", "revokeModeratorPrivilege :: Failed to revoke moderator privelege from other participant ", error);
    }
}