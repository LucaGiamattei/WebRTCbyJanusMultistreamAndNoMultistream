//Oggetto Janus per creare una sessione Janus
var janus = null;
//Info sul link al server
var server = null;
//Handler associato al plugin VideoRoom
var handle_vr = null;

var opaqueId = "videoroomtest-"+Janus.randomString(12);


var myid = null;
var mypvtid = null;
var username = null;
//contenitore dei feed remoti (gli handler janus)
var feeds = [];

var mystream = null;
const maxFeeds = 200;
var published = true;

var capture = null;

window.onresize=recalculateLayout;




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
                                $('#joinToRoom').click(joinToRoom);
                                $('#createRoom').click(newRoom);
                                
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
                                        // Publisher/manager created, negotiate WebRTC and attach to existing feeds, if
                                        //my public id (identifier in the room)
                                        myid = msg["id"];
                                        //my private id (with janus)
                                        mypvtid = msg["private_id"];
                                        var roomid =  msg["room"];
                                        Janus.log("Successfully joined room " + msg["room"] + " with ID " + myid);
                                        
                                        //pubblico il mio feed
                                        publishOwnFeed(true);

                                        if(msg["publishers"]) {
                                            var list = msg["publishers"];
                                            Janus.debug("Got a list of available publishers/feeds:", list);
                                            for(var f in list) {
                                                var id = list[f]["id"];                                               
                                                var audio = list[f]["audio_codec"];
                                                var video = list[f]["video_codec"];
                                                Janus.debug("  >> [" + id + "] "  + " (audio: " + audio + ", video: " + video + ")");
                                                newRemoteFeed(id ,roomid, audio, video);
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
                                            var roomid =  msg["room"];
                                            var list = msg["publishers"];
                                            Janus.debug("Got a list of available publishers/feeds:", list);
                                            for(var f in list) {
                                                var id = list[f]["id"];    
                                                var audio = list[f]["audio_codec"];
                                                var video = list[f]["video_codec"];
                                                Janus.debug("  >> [" + id + "] " + " (audio: " + audio + ", video: " + video + ")");
                                                newRemoteFeed(id,roomid, audio, video);
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
                                                
                                                feeds[remoteFeed.rfindex] = null;
                                                remoteFeed.detach();
                                            }
                                        } else if(msg["unpublished"]) {
                                            // One of the publishers has unpublished?
                                            var unpublished = msg["unpublished"];
                                            Janus.log("Publisher left: " + unpublished);
                                            
                                           
                                            if(unpublished === 'ok') {
                                                // That's us
                                                handle_vr.hangup();

                                                $('#unpublish').attr("disabled",true);
                                                setTimeout(() => {
                                                    $('#unpublish').attr("disabled",false);
                                                    $('#unpublish').html("Publish" );
                                                    published = false;
                                                }, 3000);
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
            
                                                
                                                feeds[remoteFeed.rfindex] = null;
                                                remoteFeed.detach();
                                                $("#remotevideo" + remoteFeed.rfindex).parent().addClass("hide");
                                                recalculateLayout();
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
                                        else if (msg["configured"]){
                                            Janus.log("configured")
                                            $('#unpublish').attr("disabled",true);
                                            setTimeout(function(){    
                                                $('#unpublish').attr("disabled",false);
                                                $('#unpublish').html( "Unpublish");
                                                published = true;
                                            },3000)
                                            

                                        }
                                    }
                                    
                                }
                                if(jsep) {
                                    Janus.debug("Handling SDP as well...", jsep);
                                    handle_vr.handleRemoteJsep({ jsep: jsep });
                                    
                                }
                            },
                            onlocalstream: function(stream) {
                                mystream = stream;
                                $('#JoinedOrCreatedToRoom').addClass("hide");
                                $("#myvideo-container").removeClass("hide");
                                $('#mainPage').addClass("hide");
                                $("#gallery").removeClass("hide"); 
                                $("#unpublish").removeClass("hide");
                                $("#Screen").removeClass("hide");

                                document.getElementById("displayname").textContent=username;
                                $('#unpublish').click(toggleOwnFeed);
                                $('#mute').click(toggleMute);
                                $('#Screen').click(preShareScreen);
                                Janus.attachMediaStream($('#myvideo').get(0), stream);
                                recalculateLayout();

                            },
                            onremotestream: function(stream) {
                                // The publisher stream is sendonly, we don't expect anything here
                            },
                            oncleanup: function() {
                                Janus.log(" ::: Got a cleanup notification: we are unpublished now :::");
                                mystream = null;
                                
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

function shareScreen(){

}

function joinToRoom(){
    var text_joinToRoom = parseInt(prompt("Name of the room to join"));
   
    if( isNaN(text_joinToRoom) ||text_joinToRoom===null) {
		// Create fields to register
        bootbox.alert("Please enter an integer value");	
	} else {
        $("#buttonsPage").addClass("hide");
        $("#JoinedOrCreatedToRoom").removeClass("hide").show();
        var JoinedOrCreatedToRoom=document.getElementById("JoinedOrCreatedToRoom");
        handle_vr.spinner = new Spinner().spin(JoinedOrCreatedToRoom);
		var register = {
			request: "join",
			room: text_joinToRoom,
            ptype: "publisher",
            display: username
        };
		handle_vr.send({ message: register });
	}

}

function newRoom(){
    text_nameRoomToCreate = parseInt(prompt("Name of the room to create"));
    
    if(isNaN(text_nameRoomToCreate) ||text_nameRoomToCreate === null ) {
		bootbox.alert("Please enter an integer value");
	} else {
        $("#buttonsPage").addClass("hide");
        $("#JoinedOrCreatedToRoom").removeClass("hide").show();
        var JoinedOrCreatedToRoom=document.getElementById("JoinedOrCreatedToRoom");
        handle_vr.spinner = new Spinner().spin(JoinedOrCreatedToRoom);
        create_request= {
            request: "create",
            room: text_nameRoomToCreate        
        }
        handle_vr.send({ message: create_request ,success: function (msg){
            if (msg["videoroom"]==="created"){
                var register = {
                    request: "join",
                    room: text_nameRoomToCreate,
                    ptype: "publisher",
                    display: username
                };
                handle_vr.send({ message: register });

            }
           
        }});

    }

}


function publishOwnScreen() {
	// This is our session, publish our stream
    Janus.debug("Negotiating WebRTC stream for our screen (capture " + capture + ")");
    handle_vr.createOffer(
        {
            media: { video: capture, audioSend: false, videoRecv: false},	// Screen sharing Publishers are sendonly
            success: function(jsep) {
                Janus.debug("Got publisher SDP!", jsep);
                var publish = { request: "configure", audio: false, video: false };
                handle_vr.send({ message: publish, jsep: jsep });
            },
            error: function(error) {
                Janus.error("WebRTC error:", error);
                bootbox.alert("WebRTC error... " + error.message);
            }
        });
}

function preShareScreen() {
	if(!Janus.isExtensionEnabled()) {
		bootbox.alert("You're using Chrome but don't have the screensharing extension installed: click <b><a href='https://chrome.google.com/webstore/detail/janus-webrtc-screensharin/hapfgfdkleiggjjpfpenajgdnfckjpaj' target='_blank'>here</a></b> to do so", function() {
			window.location.reload();
		});
		return;
	}
	
	capture = "screen";
	if(navigator.mozGetUserMedia) {
		// Firefox needs a different constraint for screen and window sharing
		bootbox.dialog({
			title: "Share whole screen or a window?",
			message: "Firefox handles screensharing in a different way: are you going to share the whole screen, or would you rather pick a single window/application to share instead?",
			buttons: {
				screen: {
					label: "Share screen",
					className: "btn-primary",
					callback: function() {
						capture = "screen";
						publishOwnScreen();
					}
				},
				window: {
					label: "Pick a window",
					className: "btn-success",
					callback: function() {
						capture = "window";
						publishOwnScreen();
					}
				}
			},
			onEscape: function() {
				
			}
		});
	} else {
		publishOwnScreen();
	}
}

function publishOwnFeed(useAudio) {
	handle_vr.createOffer(
		{
			// Add data:true here if you want to publish datachannels as well
			media: { audioRecv: false, videoRecv: false, audioSend: useAudio, videoSend: true, data:true },	// Publishers are sendonly
			success: function(jsep) {
                Janus.log("Got publisher SDP!");
				Janus.debug("Got publisher SDP!", jsep);
				var publish = { request: "configure", audio: useAudio, video: true };
				handle_vr.send({ message: publish, jsep: jsep });
			},
			error: function(error) {
				Janus.error("WebRTC error:", error);
				if(useAudio) {
                    //provo senza audio
					 joinToRoom(false);
				} else {
					bootbox.alert("WebRTC error... " + error.message);
				}
			}
		});
}


///SUBSCRIBER HANDLERS ///

function newRemoteFeed(id,roomid,  audio, video) {
	// A new feed has been published, create a new plugin handle and attach to it as a subscriber
	var remoteFeed = null;
	janus.attach(
		{
			plugin: "janus.plugin.videoroom",
			opaqueId: opaqueId,
			success: function(pluginHandle) {
				remoteFeed = pluginHandle;
				Janus.log("Plugin attached! (" + remoteFeed.getPlugin() + ", id=" + remoteFeed.getId() + ")");
				Janus.log("  -- This is a subscriber");
                
				var subscribe = {
					request: "join",
					room: roomid,
					ptype: "subscriber",
					feed: id,
					private_id: mypvtid
                };
                
				remoteFeed.videoCodec = video;
				remoteFeed.send({ message: subscribe });
			},
			error: function(error) {
				Janus.error("  -- Error attaching plugin...", error);
				bootbox.alert("Error attaching plugin... " + error);
			},
			onmessage: function(msg, jsep) {
				Janus.debug(" ::: Got a message (subscriber) :::", msg);
				var event = msg["videoroom"];
				Janus.debug("Event: " + event);
				if(msg["error"]) {
					bootbox.alert(msg["error"]);
				} else if(event) {
					if(event === "attached") {
                        // Subscriber created and attached
                        
						for(var i=1;i<maxFeeds;i++) {
							if(!feeds[i]) {
								feeds[i] = remoteFeed;
								remoteFeed.rfindex = i;
								break;
							}
						}
                        remoteFeed.rfid = msg["id"];
                        remoteFeed.rfdisplay = msg["display"];
						//Janus.log("Successfully attached to feed " + remoteFeed.rfid + " (" + remoteFeed.rfdisplay + ") in room " + msg["room"]);
                        $('#remote'+remoteFeed.rfindex).removeClass('hide').html(remoteFeed.rfdisplay).show();
                        //$('#remote'+remoteFeed.rfindex).parent().removeClass('hide');
					} else if(event === "event") {

                    }
				}
				if(jsep) {
					Janus.debug("Handling SDP as well...", jsep);
					// Answer and attach
					remoteFeed.createAnswer(
						{
							jsep: jsep,
							// Add data:true here if you want to subscribe to datachannels as well
							// (obviously only works if the publisher offered them in the first place)
							media: { audioSend: false, videoSend: false, data:true },	// We want recvonly audio/video
							success: function(jsep) {
								Janus.debug("Got SDP!", jsep);
								var body = { request: "start", room: roomid };
								remoteFeed.send({ message: body, jsep: jsep });
							},
							error: function(error) {
								Janus.error("WebRTC error:", error);
								bootbox.alert("WebRTC error... " + error.message);
							}
						});
				}
			},
			iceState: function(state) {
				Janus.log("ICE state of this WebRTC PeerConnection (feed #" + remoteFeed.rfindex + ") changed to " + state);
			},
			webrtcState: function(on) {
				Janus.log("Janus says this WebRTC PeerConnection (feed #" + remoteFeed.rfindex + ") is " + (on ? "up" : "down") + " now");
			},
			onlocalstream: function(stream) {
                // The subscriber stream is recvonly, we don't expect anything here
                
			},
			onremotestream: function(stream) {
                Janus.debug("Remote feed #" + remoteFeed.rfindex + ", stream:", stream);
                var addButtons = false;	
                if($('#remotevideo'+remoteFeed.rfindex).length === 0) {
                    $('#gallery').append('<div class="video-container"> <video class="remoteStream hide" id="remotevideo' + remoteFeed.rfindex + '"  autoplay /> <h1>'+remoteFeed.rfdisplay+'</h1> </div>');
                    $("#remotevideo"+remoteFeed.rfindex).bind("playing", function () {
                        $('#remotevideo'+remoteFeed.rfindex).removeClass('hide').show();
                        
                        setTimeout(function() {recalculateLayout();}, 2000);

                    });
                }else{
                    $('#remotevideo'+remoteFeed.rfindex).parent().removeClass('hide');
                }

                Janus.attachMediaStream($('#remotevideo'+remoteFeed.rfindex).get(0), stream);
                

				
			},
			oncleanup: function() {
			}
		});
}




function toggleMute() {
	var muted = handle_vr.isAudioMuted();
	Janus.log((muted ? "Unmuting" : "Muting") + " local stream...");
	if(muted)
		handle_vr.unmuteAudio();
	else
		handle_vr.muteAudio();
	muted = handle_vr.isAudioMuted();
	$('#mute').html(muted ? "Unmute" : "Mute");
}

function toggleOwnFeed() {
	// Unpublish our stream
    if(published){
        $("#myvideo-container").addClass("hide");
        recalculateLayout();
	    var unpublish = { request: "unpublish" };
        handle_vr.send({ message: unpublish });
        

    }else{
        
        publishOwnFeed(true);
        
    }
   
}




function login() {
    if ($("#username").val().length==0){
        bootbox.alert("Please enter a valid username");
    }else{
        username = $("#username").val();
        $("#loginPage").addClass('hide');
        $("#buttonsPage").removeClass('hide').show();

    }
  
}




function recalculateLayout() {
	Janus.log("RECALCUL");
  
  const aspectRatio = 16 / 9;

  const screenWidth = document.body.getBoundingClientRect().width;
  const screenHeight = (document.body.getBoundingClientRect().height);
  const videoCount1 = document.getElementsByClassName("video-container").length;
  const videoCount2 = document.getElementsByClassName("video-container hide").length;



  const videoCount = (videoCount1-videoCount2);

  // or use this nice lib: https://github.com/fzembow/rect-scaler
  function calculateLayout(
    containerWidth,
    containerHeight,
    videoCount,
    aspectRatio,
  ) {
    let bestLayout = {
      area: 0,
      cols: 0,
      rows: 0,
      width: 0,
      height: 0
    };

    // brute-force search layout where video occupy the largest area of the container
    for (let cols = 1; cols <= videoCount; cols++) {
      const rows = Math.ceil(videoCount / cols);
      const hScale = containerWidth / (cols * aspectRatio);
      const vScale = containerHeight / rows;
      let width;
      let height;
      if (hScale <= vScale) {
        width = Math.floor(containerWidth / cols);
        height = Math.floor(width / aspectRatio);
      } else {
        height = Math.floor(containerHeight / rows);
        width = Math.floor(height * aspectRatio);
      }
      const area = width * height;
      if (area > bestLayout.area) {
        bestLayout = {
          area,
          width,
          height,
          rows,
          cols
        };
      }
    }
    return bestLayout;
  }

  const { width, height, cols } = calculateLayout(
    screenWidth,
    screenHeight,
    videoCount,
    aspectRatio
  );
  

    let root= document.documentElement;
    root.style.setProperty("--width", width + "px");
    root.style.setProperty("--height", height + "px");
    root.style.setProperty("--cols", cols + "");
}

