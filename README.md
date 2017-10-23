# Iris RTC JavaScript SDK

This document covers the APIs for Iris Rtc JavaScript SDK.

Iris RTC JavaScript SDK provides a stack of simple API's to build an application to make audio video calls, multi user conferences and PSTN call.

## Architecture

**Client:** This layer controls the UI and uses the SDK to implement the desired use cases.

**Iris Rtc JavaScript Sdk:** SDK provides three classes IrisRtcConnection, IrisRtcStream and IrisRtcSession with number of API's to access to Iris Rtc platform.

**IrisRtcConnection:** This maintains connection with Rtc server. Responsible for sending and receiving messages.

**IrisRtcStream:** A stream consists of a particular type of media/data. For e.g. for a video call, it could be a audio or a video stream. For data sharing session, it could be a video file or an image or a file. IrisRtcStream provides API to create audio or video stream.

**IrisRtcSession:** This maps to a unique room/session which can be initiated or joined through SDK APIs. A session can have multiple participants and each participant can share their streams with other participants.

**Participant:** Each participant has a unique identifier and can share their streams with other participants. A participant can be part of multiple sessions. For self initiated call, a participant will have it's local stream.

## Install Iris JS SDK
  ```sh
  npm install iris-js-sdk
  ```
  
  or include iris-js-sdk as script tag in html using
  
  
  ```html
  <script src="https://unpkg.com/iris-js-sdk@3.4.9/dist/iris-js-sdk.min.js"></script>
  ```



## APIs
- [Initialize Iris Sdk](#initialize-iris-sdk)
- [Create Iris Rtc Connection](#create-connection)
- [Create Iris Rtc Stream](#create-stream)
- [Create Iris Rtc Session](#create-session)
- [Join Iris Rtc Session](#join-session)
- [Create Iris Rtc Chat Session](#create-chat-session)
- [Join Iris Rtc Chat Session](#join-chat-session)
- [Send Chat Messages](#send-chat-messages) 
- [Set Display Name](#set-display-name)
- [Mute Local Audio](#audio-mute)
- [Mute Local Video](#video-mute)
- [Mute Remote Participant Audio](#mute-remote-participant-audio)
- [Mute Remote Participant Video](#mute-remote-participant-video)
- [End Rtc Session](#end-the-call)
- [End Rtc Connection](#disconnect-rtc-connection)
- [Switch Streams](#switch-streams)
- [How to use IrisRtcSdk](#how-to-use-irisrtcsdk)


**Initialize Iris SDK**
----
  To initialize Iris Rtc Sdk we need to set the RtcConfig and create intstances of three classes namely IrisRtcConnection, 
  IrisRtcStream and IrisRtcSession. 

* **IrisRtcConfig Update** <br />
  Create config json object with following parameters to and set it to IrisRtcConfig.

   ```sh
  -----------------------------------------------------------------------------
  Property                  Type            Description
  -----------------------------------------------------------------------------
  routingId                 string          (MANDATORY) Unique Id of the user
  irisToken                 string          (MANDATORY) iris JWT token
  domain                    string          (MANDATORY) Domain name e.g. "iris.comcast.com"
  type                      string          (MANDATORY) Call type e.g. "video", "audio", "pstn" or "chat"
  sessionType               string          (MANDATORY) Session type "create" or "join"
  roomId                    string          (MANDATORY) Unique room identifier received from EVM.
  useBridge                 boolean         (MANDATORY) For videobridge call "true" for peer to peer call "false" 
  stream                    string          (OPTIONAL)  By default call is "sendrecv". User can set "sendonly" or "recvonly"
  fromTN                    TN              (MANDATORY) Caller telephone number mandatory for PSTN calls only
  toTN                      TN              (MANDATORY) Callee telephone number mandatory for PSTN calls only
  videoCodec                string          (OPTIONAL)  Optional parameter to set vide codec. Default if H264
  urls                      json            (MANDATORY) JSON object with the eventManager urls as mentioned below
  urls.eventManager         string          (MANDATORY) "eventManagerUrl"
  urls.UEStatsServer        string          (MANDATORY) "StatsServerUrl"
  logLevel                  integer         (OPTIONAL)  Log level required by user
  name                      string          (OPTIONAL)  Name of the participant
  publicId                  string          (OPTIONAL) Public Id of the participant
  ```
 
* **Example**  <br />

  ```javascript 
    IrisRtcConfig.updateConfig(userConfig);
  ```
  
  * Initialize Iris Rtc configuration with above mentioned parameters.
   
   **Notes:** Check [How to use IrisRtcSdk](#how-to-use-irisrtcsdk) for more information on parameters

**Create Connection**
----
  This API is called to create new IrisRtcConnection which is used to make a connection with rtc server.
  It accepts irisToken and rouitngId of the user which are required to create connection. On successful
  connection this will subscribe for notification based on topic like video or audio, user will be
  notified based on subscription topic.

* **API Name** <br />

  ```javascript
    IrisRtcConnection.connect()
  ```
  
* **Parameters** <br />
  Pass the following parameters with connect API:

  ```sh
  -----------------------------------------------------------------------------
  Property                Type            Description
  -----------------------------------------------------------------------------
  irisToken               string          (MANDATORY) Authorization token
  routingId               string          (MANDATORY) Unique participant id. 
                                                      e.g. "routingId@appdomain.com"
  eventManagerUrl         string          (MANDATORY) Event Manager url to make iris connection                                                    
  ```

* **Example** <br />

  ```javascript
    var irisRtcConnection = new IrisRtcConnection();
    irisRtcConnection.connect(irisToken, routingId, eventManagerUrl);
  ```

  * Initialize Iris Rtc Connection object
  * Call connect API of Iris connection with irisToken and rouitngId of user
  * Wait for irisRtcConnection.onConnected callback if connection is successful or irisRtcConnection.onConnectionFailed callback if connection fails with error.

* **Events** <br/>

  * **onConnected** event is triggered when the connection has been successfully established. Upon onConnected callback 
    notification subscription is done.
  * **onConnectionFailed** event is triggered when failed to establish a connection

**Create Stream**
----
  This API is called to create local media streams based on type of call,
  like audio call or video call. Client will receive local media streams. These streams are used
  to provide a local preview to user and used to create a iris rtc session.

* **API Name** <br />

  ```javascript
    IrisRtcStream.createStream()
  ```

* **Parameters** <br />
  Pass the following parameters in object:

  ```sh
  -----------------------------------------------------------------------------
  Property                Type            Description
  -----------------------------------------------------------------------------
  streamConfig            object          (MANDATORY) Type of stream based on video call or audio call, resolution, contraints(OPTIONAL) 
                                                      e.g. {"streamType": streamType, "resolution": resolution, "constraints": constraints}
  ```

* **Example** <br />

  ```javascript
    var irisRtcStream = new IrisRtcStream();
    
    var streamConfig = { 
      streamType : video,
      resolution : "hd",
      constraints : { video : false, audio: false }
    }
    
    irisRtcStream.createStream(streamConfig);
  ```

  * Initialize Iris Rtc Stream object
  * Call createStream API of Iris stream with streamType like 'video', 'audio'
  * Wait for Stream.onLocalStream callback to receive a local media stream

* **Event**<br />
  * **onLocalStream** event is triggered when the local video and audio tracks are successfully created.

**Create Session**
----
  This API is called to create the rtc session. Manages differet types of calls like
  video call, audio call, PSTN/Sip call, chat messages and picture share. This API is used for
  creating a new session. Stream object received as  parameter will be added to the conference.

* **API Name** <br />

  ```javascript
    IrisRtcSession.createSession()
  ```

* **Parameters** <br />
  Pass the following parameter in createSession API call:

  ```sh
  -----------------------------------------------------------------------------
  Property                Type              Description
  -----------------------------------------------------------------------------
  userConfig              json              (MANDATORY) Same as the userConfig defined above should have 
                                                        type, irisToken, routingId and userData
                                                        type is call type like "video" or "audio"
                                                        roomId - Room id received from create room call
                                                        userData - Data and Notification payload to be sent to the createrootevent API
  connection              object            (MANDATORY) IrisRtcConnection object
  stream                  object            (MANDATORY) Local media stream object received on onLocalStream
                                                        when createStream API is called                                                                                            
  ```

* **Example** <br />

  ```javascript
    var irisRtcSession = new IrisRtcSession();
    irisRtcSession.createSession(userConfig, connection, stream);
  ```

  * Initialize Iris Rtc Session object.
  * Call createSession API of Iris Session with streamObject which has local meida tracks which are received in onLocalStream, participants to whom user is calling, user data that is to be sent for the createrootevent request and notification payload in case of incoming call.
  * Wait for irisRtcSession.onSessionCreated and irisRtcSession.onSessionConnected to receive on successfull session creatd notifications.

* **Events** <br />    
  * **onSessionCreated** event is triggered when the session is successfully created.
  * **onSessionConnected** event is triggered when the user joins the session.

**Join Session**
----
  This API is called to join the rtc session. Manages differet types of calls like
  video call, audio call, PSTN/Sip call, chat messages and picture share. This API is used for
  joining a new session. Stream object received as  parameter will be added to the conference.

* **API Name** <br />

  ```javascript
    IrisRtcSession.joinSession
  ```

* **Parameters** <br />
  Pass the following parameter in joinSession API call:

  ```sh
  -----------------------------------------------------------------------------
  Property                Type              Description
  -----------------------------------------------------------------------------
  userConfig              json              (MANDATORY) Same as the userConfig defined above should have 
                                                        type, irisToken and userData.
                                                        type is call type like "video" or "audio"
                                                        roomId - Room id received from create room call
                                                        userData - Data and Notification payload to be sent to the createrootevent API
  connection              object            (MANDATORY) IrisRtcConnection object
  streamObject            object            (MANDATORY) Local media stream object received when createStream API is called

  notificationPayload     json              (MANDATORY) This is the notification payload received through onNotifcation event
                                                        pass this notification as received - DONT ALTER ANY PARAMETERS                                                               
  ```

* **Example** <br />

  ```javascript
    var irisRtcSession = new IrisRtcSession();
    irisRtcSession.joinSession(config, connection, stream, notificationPayload);
  ```

  * Initialize Iris Rtc Session object.
  * Call joinSession API of Iris RTC Session with streamObject which has local meida tracks which are received in onLocalStream, userConfig with callType and notification payload in case of incoming call.
  * Wait for irisRtcSession.onSessionCreated and irisRtcSession.onSessionConnected to receive on successfull session creatd notifications.

* **Events** <br />    
  * **onSessionCreated** event is triggered when the session is successfully created.
  * **onSessionConnected** event is triggered when the user joins the session.

**Create Chat Session**
----
  This API is called to create a new chat ONLY iris rtc session. provides option for group chat messages

* **API Name** <br />

  ```javascript
    IrisRtcSession.createChatSession
  ```

* **Parameters** <br />
  Pass the following parameter in createChatSession API call:

  ```sh
  -----------------------------------------------------------------------------
  Property                Type              Description
  -----------------------------------------------------------------------------
  userConfig              json              (MANDATORY) Same as the userConfig defined above should have 
                                                        type and userData.
                                                        type is call type like "chat"
                                                        roomId - Room id received from create room call
                                                        userData - Data and Notification payload to be sent to the createrootevent API
  connection              object            (MANDATORY) IrisRtcConnection object                            
  ```

* **Example** <br />

  ```javascript
    var irisRtcSession = new IrisRtcSession();
    irisRtcSession.createChatSession(userConfig, connection);
  ```

  * Initialize Iris Rtc Session object.
  * Call createChatSession API of Iris RTC Session withnuserConfig with callType and roomId  
  * Wait for irisRtcSession.onSessionCreated and irisRtcSession.onSessionConnected to receive on successfull session created events.

* **Events** <br />    
  * **onSessionCreated** event is triggered when the session is successfully created.
  * **onSessionConnected** event is triggered when the user joins the session.


**Join Chat Session**
----
  This API is called to join the chat rtc session. Manages group chat messages. This API is used for
  joining a chat session. Stream object received as  parameter will be added to the conference.

* **API Name** <br />

  ```javascript
    IrisRtcSession.joinChatSession
  ```

* **Parameters** <br />
  Pass the following parameter in joinChatSession API call:

  ```sh
  -----------------------------------------------------------------------------
  Property                Type              Description
  -----------------------------------------------------------------------------
  userConfig              json              (MANDATORY) Same as the userConfig defined above should have 
                                                        type and userData.
                                                        type is call type like "chat"
                                                        roomId - Room id received from create room call
                                                        userData - Data and Notification payload to be sent to the createrootevent API
  connection              object            (MANDATORY) IrisRtcConnection object                            
  notificationPayload     json              (MANDATORY) This is the notification payload received through onNotifcation event
                                                        pass this notification as received - DONT ALTER ANY PARAMETERS                                                               
  ```

* **Example** <br />

  ```javascript
    var irisRtcSession = new IrisRtcSession();
    irisRtcSession.joinChatSession(userConfig, connection, notification);
  ```

  * Initialize Iris Rtc Session object.
  * Call joinChatSession API of Iris RTC Session with userConfig which has callType and notification payload received through onNotification.
  * Wait for irisRtcSession.onSessionCreated and irisRtcSession.onSessionConnected to receive on successfull session creatd notifications.

* **Events** <br />    
  * **onSessionCreated** event is triggered when the session is successfully created.
  * **onSessionConnected** event is triggered when the user joins the session.


**Send Chat Messages**
----
  This API allows user to send group chat messages. 

* **API Name** <br />
  
  ```javascript
    IrisRtcSession.sendChatMessage
  ```

* **Parameters** <br />
  Pass the following parameter in sendChatMessage api call:

  ```sh
  -----------------------------------------------------------------------------
  Property                Type            Description
  -----------------------------------------------------------------------------
  roomId                  string          (MANDATORY) Unique id of the room
  message                 String          (MANDATORY) Message to be sent
  id                      string          (MANDATORY) Unique id for the message
  ```

* **Example** <br />

  ```javascript
    irisRtcSession.sendChatMessage(roomId, id, message)
  ```
  * Call sendChatMessage API of Iris Rtc Session to send messages.



**Receive Chat Messages**
----
  This API allows user to receive group chat messages. 

* **API Name** <br />
  
  ```javascript
    IrisRtcSession.onChatMessage
  ```

* **Parameters** <br />
  Parameter in onChatMessage api call are roomId and chatMsgJson which will have:

  ```sh
  -----------------------------------------------------------------------------
  Property                Type            Description
  -----------------------------------------------------------------------------
  message                 string          Message received
  from                    string          Remote participant id
  rootNodeId              string          Root node id for the message
  childNodeId             string          Child node id for the meesage
  ```

* **Example** <br />

  ```javascript
    irisRtcSession.onChatMessage = function(roomId, chatMsgJson){}
  ```
  * Call onChatMessage API of Iris Rtc Session to receive messages.



**Receive Chat Message Acknowledgement**
----
  This API allows user to receive acknowledgement for group chat messages. 

* **API Name** <br />
  
  ```javascript
    IrisRtcSession.onChatAck
  ```

* **Parameters** <br />
  Parameter in onChatAck api call are roomId and chatAckJson which will have :

  ```sh
  -----------------------------------------------------------------------------
  Property                Type            Description
  -----------------------------------------------------------------------------
  id                      string          Unique id for the message sent
  statusCode              string          Status of the sent message
                                          200 : Messages is sent
                                          400 : Failed to send
                                          0 : Evm is not available
  statusMessage           string          Status message above codes "Sucess", "Failed" and "Evm is down"
  rootNodeId              string          Tiemebased v1 uuid
  childNodeId             string          Timebased v1 uuid
 
  ```


* **Example** <br />

  ```javascript
    irisRtcSession.onChatAck = function(roomId, chatAckJson){}
  ```
  * Listen to onChatAck callback of Iris Rtc Session to receive ack messages.


**Audio Mute**
----
  This API allows user to mute local audio. 

* **API Name** <br />
  
  ```javascript
    IrisRtcSession.audioMuteToggle
  ```
* **Example** <br />

  ```javascript
    irisRtcSession.audioMuteToggle(roomId)
  ```
  * Call audioMuteToggle API of Iris Session when you want to mute audio.

**Video Mute**
----
  This API allows user to mute local video. 

* **API Name** <br />

  ```javascript
    IrisRtcSession.videoMuteToggle
  ```

* **Example** <br />

  ```javascript
    irisRtcSession.videoMuteToggle(roomId)
  ```  
  * Call videoMuteToggle API of Iris Session when you want to mute video


**Mute Remote Participant Audio**
----
  This API allows user to mute remote participant audio. 

* **API Name** <br />
  
  ```javascript
    IrisRtcSession.muteParticipantAudio
  ```
* **Example** <br />

  ```javascript
    irisRtcSession.muteParticipantAudio(roomId, jid, mute)
  ```
  * Call muteParticipantAudio API of Iris Session when you want to mute participant audio.

**Mute Remote Participant Video**
----
  This API allows user to mute remote participant video. 

* **API Name** <br />

  ```javascript
    IrisRtcSession.muteParticipantVideo
  ```

* **Example** <br />

  ```javascript
    irisRtcSession.muteParticipantVideo(roomId, jid, mute)
  ```  
  * Call muteParticipantVideo API of Iris Session when you want to mute participant video


**Set Display Name**
----
  This API allows user to set the display name. 

* **API Name** <br />

  ```javascript
    IrisRtcSession.setDisplayName
  ```

* **Example** <br />

  ```javascript
    irisRtcSession.setDisplayName(roomId, name)
  ```  
  * Call setDisplayName API of Iris Session to set the display name


**End the Call**
----
  This API allows user to disconnect or end a call or session.

* **API Name** <br />

  ```javascript
    IrisRtcSession.endSession
  ```
* **Example:** <br />

  ```javascript
    irisRtcSession.endSession(roomId);
  ```
  * Call endSession API of Iris Session to end the call.

* **Events** <br />  
  * **onSessionEnd** event is triggered when session is closed.

**Disconnect Rtc Connection**
----
  This API allows user to close connection with rtc server.

* **API Name** <br />

  ```javascript 
    IrisRtcConnection.close
  ```

* **Example** <br />

  ```javascript
    irisRtcConnection.close();
  ```
  * Call close API of Iris Connection to end the connection.

* **Event** <br />  
  * **onClose** event is triggered when the session is closed.

**Hold PSTN Call**
----
  This API allows user to put call on hold.

* **API Name** <br />
  IrisRtcSession.pstnHold()

* **Example** <br />

  ```javascript
    irisRtcSession.pstnHold(roomId, participnatJid)
  ```
  * Call pstnHold API of Iris session to put a call on hold.

**Unhold PSTN Call**
----
  This API allows user to unhold the call.

* **API Name** <br />

  ```javascript
    IrisRtcSession.pstnUnHold
  ```
* **Example** <br />

  ```javascript
    irisRtcSession.pstnUnHold(roomId, participantJid)
  ```
  * Call pstnUnHold API of Iris session to come back to call again.

**Merge PSTN Call**
----
  This API allows user to merge two pstn calls.

* **API Name** <br />

  ```javascript
    IrisRtcSession.pstnMerge
  ```
* **Example** <br />

  ```javascript
    irisRtcSession.pstnMerge(roomId, firstParticipantJid, secondSession, secondParticipantJid)
  ```
  * Call pstnMerge API of Iris session to merge two pstn calls


**Switch Streams**
----
  This API allows user to switch streams between the cameras, can be used for screen share as well

* **API Name** <br />

  ```javascript 
    IrisRtcSession.switchStream
  ```

* **Example** <br />

  ```javascript
    //irisRtcStream is an IrisRtcStream object to listen to local streams
    var streamConfig = { 
      streamType : video,
      resolution : "hd",
      constraints : { video : false, audio: false }
    }
    irisRtcSession.switchStream(roomId, irisRtcStream, streamConfig);
  ```
  * Call switchStream API of to change the stream user is streaming


# Callback Event Handlers

**onConnected**
----
  Client should implement this callback function to receive an event when connection is successfully established.
  
  * **Callback Name** <br />
    
  ```javascript
    IrisRtcConnection.onConnected
  ```

  * **Usage:** <br />
    ```javascript
      irisRtcConnection.onConnected = function() {
        // Rtc connection established 
      }
    ```


**onConnectionFailed**
----
  Client should implement this callback function to receive an event when connection fails due to an error
  
  * **Callback Name** <br />

  ```javascript
    IrisRtcConnection.onConnectionFailed
  ```

  * **Usage:** <br />

  ```javascript
    irisRtcConnection.onConnectionFailed = function(error){
      // Rtc connection failed
    }
  ```

**Receive LocalStream**
----
  To display the local preview of the client, client has to implement this callback function. This allows user to receive local video tracks and audio tracks.
  
  * **Callback Name** <br />

  ```javascript
    IrisRtcStream.onLocalStream
  ```
  
  * **Usage:** <br />

  ```javascript
    IrisRtcStream.onLocalStream = function(stream) {
      // Local stream is received
    } 
  ```
  * **Parameters** <br />
    Following parameters are received through callback function:

    ```sh
      ---------------------------------------------------------------------------
      Property            Type                      Description
      ---------------------------------------------------------------------------
      stream              object                    (MANDATORY) An object with audio and video streams
    ```

**Receive RemoteStream**
----
  To display the remote video of the participant, client has to implement this callback function. This allows user to receive remote video tracks and audio tracks.
  
  * **Callback Name** <br />

  ```javascript
    IrisRtcSession.onRemoteStream
  ```

  * **Usage:** <br />
    ```javascript
      irisRtcSession.onRemoteStream = function(roomId, remoteStream) {
        // Remote particpants stream is received
      }
    ```
  * **Parameters** <br />
    Following parameters are received through callback function:

    ```sh
      ---------------------------------------------------------------------------
      Property            Type                    Description
      ---------------------------------------------------------------------------
      roomId              string                  (MANDATORY) Unique id of the room
      remoteStream        object                  (MANDATORY) An object with remote audio and video streams
    ```

**Session Created**
----
  Client should implement this callback function to receive an event when a session is successfully created.
  
  * **Callback Name** <br />
  
  ```javascript
    onSessionCreated
  ```
  * **Usage:** <br />
    ```javascript
      IrisRtcSession.onSessionCreated = function(roomID) {
        // Room is created and user has joined
        // roomId - unique id of the room
      }
    ```

  * **Parameters** <br />
    Following parameters are received through callback function:

    ```sh
      ---------------------------------------------------------------------------
      Property            Type            Description
      ---------------------------------------------------------------------------
      roomId              string          Unique id of the room
    ```

**Session Connected**
----
  Client should implement this callback function to receive an event when the user joins session.
  
  * **Callback Name** <br />
  
  ```javascript
    onSessionJoined
  ```

  * **Usage:** <br />
  
  ```javascript
    // Listen on session object
    irisRtcSession.onSessionConnected = function(roomId) {
      // Connection is established between particpants
    }
  ```
  * **Parameters** <br />
    Following parameters are received through callback function:

    ```sh
      ---------------------------------------------------------------------------
      Property            Type            Description
      ---------------------------------------------------------------------------
      roomId              string          Unique id for the room
    ```

**Remote Participant Joined**
----
  Client should implement this callback function to receive an event when the user joins session.
  
  * **Callback Name** <br />
  
  ```javascript
    onSessionParticipantJoined
  ```

  * **Usage:** <br />
  
  ```javascript
    // Listen on session object
    irisRtcSession.onSessionParticipantJoined = function(roomId, participantJid) {
      // Remote participant has joined the conference
    }
  ```
  * **Parameters** <br />
    Following parameters are received through callback function:

    ```sh
      ---------------------------------------------------------------------------
      Property            Type            Description
      ---------------------------------------------------------------------------
      roomId              string          Unique id of the room
      participantJid      string          Remote particpant's unique id
    ```

**Session Connection Error**
----
  Client should implement this callback function to receive an event when there is an error in establishing connection between particpants in a session.
  
  * **Callback Name** <br />
  
  ```javascript
    onConnectionError
  ```

  * **Usage:** <br />
    
  ```javascript
    // Listen on session object
    irisRtcSession.onError = function(roomId, error) {
      // Session creation is failed with an error
    }
  ```

**Participant Leaves Session**
----
  Client should implement this callback function to receive an event when a remote participant leaves the session.
  
  * **Callback Name** <br />
  
  ```javascript
    onSessionParticipantLeft
  ```

  * **Usage:** <br />
    
   ```javascript
      // Listen on session object
      irisRtcSession.onSessionParticipantLeft = function(roomId, participantJid, closeSession) {
        // Remote participant has left the room
      }
  ```
    
  * **Parameters** <br />
    Following parameters are received through callback function:

    ```sh
      ---------------------------------------------------------------------------
      Property            Type            Description
      ---------------------------------------------------------------------------
      roomId              string          Unique id for room
      participantJid      string          Remote particpant's unique id
      closeSession        boolean         This boolean is true when last particpant is left the room
    
    ```


**Dominant Speaker Change**
----
  Client should implement this callback function to receive an event about dominant speaker change in the conference.
  
  * **Callback Name** <br />

  ```javascript
    onDominantSpeakerChanged
  ```
  * **Usage:** <br />
    ```javascript
      // Listen to event on session object
      irisRtcSession.onDominantSpeakerChanged = function(roomId, id) {
        // Dominant speaker in conference is changed
      }
    ```
  * **Parameters** <br />
    Following parameters are received through callback function:

    ```sh
      ---------------------------------------------------------------------------
      Property          Type            Description
      ---------------------------------------------------------------------------
      roomId            string          Unique id of the room
      id                string          "id" of the dominant speaker 
    ```

***

# How to use IrisRtcSdk

### Install SDK

  Install Iris JavaScript SDK using npm

  ```sh
  npm install iris-js-sdk
  ```
  
  or include iris-js-sdk as script tag in html using
  
  
  ```html
  <script src="https://unpkg.com/iris-js-sdk@3.4.9/dist/iris-js-sdk.min.js"></script>
  ```
  
### Example for Using API's

  ```javascript
    // Require iris-js-sdk in client. This will load IrisRtcConnection,
    // IrisRtcSession and IrisRtcStream
    var IrisRtcSDK = require(iris-js-sdk);
    var IrisRtcConnection = IrisRtcSDK.IrisRtcConnection;
    var IrisRtcStream = IrisRtcSDK.IrisRtcStream;
    var IrisRtcSession = IrisRtcSDK.IrisRtcSession;
    
    // Initializing Iris Rtc Sdk
    // Initialize configuration with below mentioned parameters.
  
    var config = {};
    
    // Unique routingId of the particpant
    config.routingId            =     ""
    
    // Iris JWT token
    config.irisToken            =     ""
    
    // application is domain
    config.domain               =     "xxxxxxxx.xxxxxxx.com";
    
    // Type of call user wants to make
    // "video" - call with both video and audio
    // "audio" - call with only audio
    // "pstn"  - call with audio for PSTN
    // "chat"  - call with only chat messages
    config.type                 =     "video";
    
    // Session type create session or join session
    config.sessionType          =      "create" // "join"
    
    // A boolean value
    // "true" - Uses videobridge
    // "false" - Uses P2P
    config.useBridge            =     true;
    
    // A boolean value
    // "true" - enables user to join an anonymous session 
    // "false" - Non-anonymous call user has to provide username and password to login
    config.anonymous            =     true;
    
    // Any alphanumeric string can be a roomName or session name to join anonymous session
    config.roomName             =     "room";
    
    // Make two way or one way call
    // "sendrecv" - Two way call
    // "sendonly" - Caller sends his media and wont receive any media from remote participant
    // "recvonly" - Caller receives remote participants media and doesn't share is media.
    // It is an optional parameter by default it will be "sendrecv"
    config.stream               =     "sendonly"
    
    // Telephone number of the participant
    config.fromTN               =     1234567890
    
    // Telephone number of the remote participant
    config.toTN                 =     1234567890

    // SDK log levels
    // 0 : ERROR; 1 : WARNING; 2 : INFO; 3 :  VERBOSE
    config.logLevel             =       3
    
    // Set name for the user
    config.name                 =     "Shiva"

    // URLs required 
    config.urls.eventManager    =     "url";
    config.urls.UEStatsServer   =     "url";

    // Initialize IrisRtcSdk with init by passing config 
    IrisRtcConfig.updateConfig(config);
  
    // Create Iris Rtc Connection
    //
    // Initialize Iris Rtc Connection object
    // Call connect API of Iris connection with irisToken and routingId of user
    // Wait for IrisRtcConnection.onConnected callback if connection is successful or 
    // IrisRtcConnection.onConnectionFailed callback if connection fails with error.  

    var irisRtcConnection = new IrisRtcConnection();
    irisRtcConnection.connect(irisToken, routingId);

    irisRtcConnection.onConnected = function() {
      // Connection is successful with rtc server.
      // Subscribed to receive incoming call notification
      // Now do Iris create stream
    }
    
    irisRtcConnection.onConnectionFailed = function(){
      // Connection failed
    }
    
    // Create Iris Rtc Stream
    //
    // Initialize Iris Rtc Stream object
    // Call createStream API of Iris stream with json streamConfig which has 
    // streamType - 'video', 'audio'
    // constraints - Media constraints
    // resolution - "hd" or "sd"
    // Wait for IrisRtcStream.onLocalStream callback to receive local video and audio tracks
    // These tracks previewed to the user and also these are passed as agrument to create a
    // new iris rtc session.
 
    var irisRtcStream = new IrisRtcStream();
    
    // set stream type as video or audio and video resolution
    var streamConfig = {
        "streamType": "video", // audio, pstn
        "resolution": "hd", //640, 320
    }
    // Set media constraints, this is optional if you are setting streamType above
    // It is an optional parameter 
    var constraints = {
      video : { mandatory: {}, optional: [] },
      audio : { mandatory: {}, optional: [] }
    }
    streamConfig.constraints = constraints;
    
    // User can either set streamType or constraints
    var localStream = irisRtcStream.createStream(streamConfig);
    
    irisRtcStream.onLocalStream = function(localStream) {
      // Render local video and audio to user
      // Pass these tracks to createSession API of IriRtcSession to create session
    } 

    // Create Iris Rtc Session
    //
    // Call createSession API of Iris Session with 
    // "userConfig" userConfig object created above with type, roomId and userData
    // "connection" Iris rtc connection object
    // "stream" having local media tracks received from onLocalStream
    // Session manages audio call, video call, pstn calls, chat messages
    
    var irisRtcSession = new IrisRtcSession();
    irisRtcSession.createSession(userConfig, connection, stream);

    // Wait for irisRtcSession.onSessionCreated callback event 
    irisRtcSession.onSessionCreated = function(roomId) {
      // Session is created
    }
    
    // Wait for irisRtcSession.onSessionJoined callback event 
    irisRtcSession.onSessionJoined = function(roomId, myJid) {
      // User joined the session
    }
    
    // Wait for irisRtcSession.onSessionJoined callback event.
    irisRtcSession.onSessionConnected = function(roomId) {
      // User joined the session
    }
    
    // Wait for irisRtcSession.onSessionParticipantJoined callback event
    irisRtcSession.onSessionParticipantJoined = function(roomId, participantJid) {
      // Remote participant joined the session
    }
    
    // On remote stream received from remote participant
    irisRtcSession.onRemoteStream = function(roomId, remoteStream) {
      // Render remote media tracks to user
    }
    
    irisRtcSession.onError = function(error) {
      // Error while joining the session
    }

    irisRtcSession.onSessionParticipantLeft = function(roomId, participantJid, closeSession) {
      // Remote participant left the conference. 
      // Remove local tracks from conference
      // end the session
    }
        
    // To set display name
    // Call this API to set display name
    irisRtcSession.setDisplayName(roomId, name);
    

    // To Send and Receive chat messages
    // To send chat message call sendChatMessage
    // message - text message to be sent
    // id - Unique Id for the message
    irisRtcSession.sendChatMessage(roomId, id, message);

    // To receive chat message
    // Listen to onChatMessage on session object
    irisRtcSession.onChatMessage = function(roomId, chatMsgJson){
      // Text message is received from a participant
    }
    
    // Listen to this callback for Chat message acknowledgement
    irisRtcSession.onChatAck = function(roomId, chatAckJson){
      // This event is recieved for every message sent out
      // chatAckJson will id, statusCode, statusMessage, rootNodeId
      // and childNodeId paramaeters
    }
    
    // Screen Share or Switch Streams
    //
    // To switch streams between two camera devices
    // This API also used for screen share with constraints in streamConfig
    // irisRtcStream is an object of IrisRtcStream to listen to onLocalStream
    irisRtcSession.switchStream(irisRtcStream, streamConfig){
     // Switches the stream from one camera or other
     // can share screen as well
    }

    // Call toggleAudioMute API of Iris Stream when you want to mute audio.
    irisRtcSession.audioMuteToggle(roomId)
  
    // Call toggleVideoMute API of Iris Stream when you want to mute video.
    irisRtcSession.videoMuteToggle(roomId)

    // Call muteParticipantAudio API of Iris Stream when you want to mute participant audio.
    irisRtcSession.muteParticipantAudio(roomId, jid, mute)
  
    // Call muteParticipantVideo API of Iris Stream when you want to mute participant video.
    irisRtcSession.muteParticipantVideo(roomId, jid, mute)

    // End Iris Rtc Session
    // Call endSession API of Iris Session to end the call
    irisRtcSession.endSession(roomId);
  
    // Disconnect rtc connection.
    irisRtcConnection.close();
    
  ```
