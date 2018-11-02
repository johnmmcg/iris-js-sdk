var logger = require('../RtcLogger.js');

var GoogleLibPhoneNumber = require('google-libphonenumber');
var GooglePhoneUtil = GoogleLibPhoneNumber.PhoneNumberUtil.getInstance();;
var PNF = GoogleLibPhoneNumber.PhoneNumberFormat
var defaultCountryCode = "US";

var PhoneUtils = {

    hasStarCode: function(num) {

        try {
            if (num && num.startsWith("*")) return true;
            else return false;
        } catch (err) {
            logger.log(logger.level.ERROR, "PhoneUtils", "Error in hasStarCode : ", err);
            throw err;
        }
    },

    hasE164Prefix: function(num) {
        try {
            if (num && num.startsWith("+")) return true;
            else return false;
        } catch (err) {
            logger.log(logger.level.ERROR, "PhoneUtils", "Error in hasE164Prefix : ", err);
            throw err;
        }
    },

    isNonStdTN: function(num) {
        try {
            return (!PhoneUtils.hasStarCode(num) && !PhoneUtils.hasE164Prefix(num) && num.length < 10);

        } catch (err) {
            logger.log(logger.level.ERROR, "PhoneUtils", "Error in isNonStdTN : ", err);
            throw err;
        }
    },

    getTN: function(num) {

        try {

            if (!num) throw "Invalid number : " + num;

            if (num && PhoneUtils.hasStarCode(num)) {

                var TN = num.substring(3);

                return TN;

            } else {
                return num;
            }

        } catch (err) {

            logger.log(logger.level.ERROR, "PhoneUtils", "Error in getTN : ", err);

            throw err;
        }
    },

    getE164TelephoneNumber: function(num) {

        try {

            var tel = PhoneUtils.getTN(num);

            if (tel.startsWith("+")) {
                tel = GooglePhoneUtil.parse(tel);
            } else {
                tel = GooglePhoneUtil.parse(tel, defaultCountryCode);
            }

            if (GooglePhoneUtil.isValidNumber(tel)) {
                var number = GooglePhoneUtil.format(tel, PNF.E164);
                return number;

            } else {
                throw "Invalid number : " + num
            }

        } catch (err) {

            logger.log(logger.level.ERROR, "PhoneUtils", "Error in getE164TelephoneNumber : ", err);

            throw err;
        }
    },

    getStarCode: function(num) {

        try {

            if (num && hasStarCode(num)) {

                var starCode = num.substring(0, 3);

                return starCode;
            }
        } catch (err) {

            logger.log(logger.level.ERROR, "PhoneUtils", "Error in getStarCode : ", err);

            throw err;
        }

    },


    getRayoIQNumber: function(num) {

        try {
            if (PhoneUtils.hasStarCode(num) || PhoneUtils.isNonStdTN(num)) {
                return num;
            }
            return PhoneUtils.getE164TelephoneNumber(num);
        } catch (err) {

            logger.log(logger.level.ERROR, "PhoneUtils", "Error in getRayoIQNumber : ", err);

            throw err;
        }

    },

    getMUCRequestNumber: function(num) {

        try {

            if (PhoneUtils.hasStarCode(num)) {
                if (num.length > 3) {

                    return PhoneUtils.getE164TelephoneNumber(num);
                }
                return num;
            }

            if (PhoneUtils.isNonStdTN(num)) {
                return num;
            }

            return PhoneUtils.getE164TelephoneNumber(num);

        } catch (err) {

            logger.log(logger.level.ERROR, "PhoneUtils", "Error in getMUCRequestNumber : ", err);

            throw err;
        }
    }

}

module.exports = PhoneUtils;