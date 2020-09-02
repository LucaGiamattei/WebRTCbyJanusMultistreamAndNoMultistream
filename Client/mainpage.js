//Oggetto Janus per creare una sessione Janus
var janus = null;
//Info sul link al server
var server = null;
//Handler associato al plugin VideoRoom
var handle_vr = null;

var opaqueId = "videoroomtest-"+Janus.randomString(12);
var btn_createRoom = $('#createRoom');
var btn_register = $('#register');



if(window.location.protocol === 'http:')
	server = "http://" + window.location.hostname + ":8088/janus";
else
    server = "https://" + window.location.hostname + ":8089/janus";


$(document).ready(function() {
    Janus.init({
        debug: "all",
        dependencies: Janus.useDefaultDependencies(), // or: Janus.useOldDependencies() to get the behaviour of previous Janus versions
        callback: function() {
                // Done!
                if(!Janus.isWebrtcSupported()) {
                    bootbox.alert("No WebRTC support... ");
                    return;
                }
                janus = new Janus({
                    
                    server: server,
                    success: function(){
                        //the session was successfully created and is ready to be used;
                        janus.attach({
                            plugin: "janus.plugin.videoroom",
                            opaqueId: opaqueId,
                            success: function(pluginHandle) {
                                handle_vr = pluginHandle;
                                Janus.log("Plugin attached! (" + handle_vr.getPlugin() + ", id=" + handle_vr.getId() + ")");
                                Janus.log("  -- This is a publisher/manager");
                                $(btn_register).click(registerUser);
                                $(btn_createRoom).click(newRoom);
                                // Prepare the username registration
                                
                                //$('#register').click(registerUsername);
                                
                                /*
                                $('#start').removeAttr('disabled').html("Stop")
                                    .click(function() {
                                        $(this).attr('disabled', true);
                                        janus.destroy();
                                    });
                                */
                            },
                            error: function(error) {
                                Janus.error("  -- Error attaching plugin...", error);
                                bootbox.alert("Error attaching plugin... " + error);
                            },
                            consentDialog: function(on) {
                                Janus.debug("Consent dialog should be " + (on ? "on" : "off") + " now");
                                if(on) {
                                    //prima di chiamare la getusermedia
                                } else {
                                    //dopo aver completato la getusermedia
                                   
                                }
                            },
                            webrtcState: function(on) {
                                Janus.log("Janus says our WebRTC PeerConnection is " + (on ? "up" : "down") + " now");
                            },
                            iceState: function(state) {
                                Janus.log("ICE state changed to " + state);
                            },
                            mediaState: function(medium, on) {
                                Janus.log("Janus " + (on ? "started" : "stopped") + " receiving our " + medium);
                            },
                            onmessage: function(msg, jsep) {
                                Janus.debug(" ::: Got a message (publisher) :::", msg);
                                //event è l'evento (associato al parametro "videoroom" nella risposta)
                                var event = msg["videoroom"];
                                Janus.debug("Event: " + event);
                                if(event) {
                                    if(event === "joined") {
                                        // Publisher/manager created, negotiate WebRTC and attach to existing feeds, if any
                                        myid = msg["id"];
                                        mypvtid = msg["private_id"];
                                        Janus.log("Successfully joined room " + msg["room"] + " with ID " + myid);
                                        if(subscriber_mode) {
                                                                    $('#videojoin').hide();
                                                                    $('#videos').removeClass('hide').show();
                                                                } else {
                                                                    publishOwnFeed(true);
                                        }

                                        // Any new feed to attach to?
                                        if(msg["publishers"]) {
                                            var list = msg["publishers"];
                                            Janus.debug("Got a list of available publishers/feeds:", list);
                                            for(var f in list) {
                                                var id = list[f]["id"];
                                                var display = list[f]["display"];
                                                var audio = list[f]["audio_codec"];
                                                var video = list[f]["video_codec"];
                                                Janus.debug("  >> [" + id + "] " + display + " (audio: " + audio + ", video: " + video + ")");
                                                newRemoteFeed(id, display, audio, video);
                                            }
                                        }
                                    } else if(event === "destroyed") {
                                        // The room has been destroyed
                                        Janus.warn("The room has been destroyed!");
                                        bootbox.alert("The room has been destroyed", function() {
                                            window.location.reload();
                                        });
                                    } else if(event === "event") {
                                        // Any new feed to attach to?
                                        if(msg["publishers"]) {
                                            var list = msg["publishers"];
                                            Janus.debug("Got a list of available publishers/feeds:", list);
                                            for(var f in list) {
                                                var id = list[f]["id"];
                                                var display = list[f]["display"];
                                                var audio = list[f]["audio_codec"];
                                                var video = list[f]["video_codec"];
                                                Janus.debug("  >> [" + id + "] " + display + " (audio: " + audio + ", video: " + video + ")");
                                                newRemoteFeed(id, display, audio, video);
                                            }
                                        } else if(msg["leaving"]) {
                                            // One of the publishers has gone away?
                                            var leaving = msg["leaving"];
                                            Janus.log("Publisher left: " + leaving);
                                            var remoteFeed = null;
                                            for(var i=1; i<6; i++) {
                                                if(feeds[i] && feeds[i].rfid == leaving) {
                                                    remoteFeed = feeds[i];
                                                    break;
                                                }
                                            }
                                            if(remoteFeed != null) {
                                                Janus.debug("Feed " + remoteFeed.rfid + " (" + remoteFeed.rfdisplay + ") has left the room, detaching");
                                                $('#remote'+remoteFeed.rfindex).empty().hide();
                                                $('#videoremote'+remoteFeed.rfindex).empty();
                                                feeds[remoteFeed.rfindex] = null;
                                                remoteFeed.detach();
                                            }
                                        } else if(msg["unpublished"]) {
                                            // One of the publishers has unpublished?
                                            var unpublished = msg["unpublished"];
                                            Janus.log("Publisher left: " + unpublished);
                                            if(unpublished === 'ok') {
                                                // That's us
                                                sfutest.hangup();
                                                return;
                                            }
                                            var remoteFeed = null;
                                            for(var i=1; i<6; i++) {
                                                if(feeds[i] && feeds[i].rfid == unpublished) {
                                                    remoteFeed = feeds[i];
                                                    break;
                                                }
                                            }
                                            if(remoteFeed != null) {
                                                Janus.debug("Feed " + remoteFeed.rfid + " (" + remoteFeed.rfdisplay + ") has left the room, detaching");
                                                $('#remote'+remoteFeed.rfindex).empty().hide();
                                                $('#videoremote'+remoteFeed.rfindex).empty();
                                                feeds[remoteFeed.rfindex] = null;
                                                remoteFeed.detach();
                                            }
                                        } else if(msg["error"]) {
                                            if(msg["error_code"] === 426) {
                                                // This is a "no such room" error: give a more meaningful description
                                                bootbox.alert(
                                                    "<p>Apparently room <code>" + myroom + "</code> (the one this demo uses as a test room) " +
                                                    "does not exist...</p><p>Do you have an updated <code>janus.plugin.videoroom.jcfg</code> " +
                                                    "configuration file? If not, make sure you copy the details of room <code>" + myroom + "</code> " +
                                                    "from that sample in your current configuration file, then restart Janus and try again."
                                                );
                                            } else {
                                                bootbox.alert(msg["error"]);
                                            }
                                        }
                                    }
                                }
                                if(jsep) {
                                    Janus.debug("Handling SDP as well...", jsep);
                                    sfutest.handleRemoteJsep({ jsep: jsep });
                                    // Check if any of the media we wanted to publish has
                                    // been rejected (e.g., wrong or unsupported codec)
                                    var audio = msg["audio_codec"];
                                    if(mystream && mystream.getAudioTracks() && mystream.getAudioTracks().length > 0 && !audio) {
                                        // Audio has been rejected
                                        toastr.warning("Our audio stream has been rejected, viewers won't hear us");
                                    }
                                    var video = msg["video_codec"];
                                    if(mystream && mystream.getVideoTracks() && mystream.getVideoTracks().length > 0 && !video) {
                                        // Video has been rejected
                                        toastr.warning("Our video stream has been rejected, viewers won't see us");
                                        // Hide the webcam video
                                        $('#myvideo').hide();
                                        $('#videolocal').append(
                                            '<div class="no-video-container">' +
                                                '<i class="fa fa-video-camera fa-5 no-video-icon" style="height: 100%;"></i>' +
                                                '<span class="no-video-text" style="font-size: 16px;">Video rejected, no webcam</span>' +
                                            '</div>');
                                    }
                                }
                            }



                            });
                
                    },
                    error: function(error) {
                        Janus.error(error);
                        bootbox.alert(error, function() {
                            window.location.reload();
                        });
                    },
                    destroyed: function() {
                        window.location.reload();
                    }
                })
            }
        });


});


function registerUser(){

}

function newRoom(){
    
}
