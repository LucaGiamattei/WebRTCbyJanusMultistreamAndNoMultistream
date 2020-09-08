

//Oggetto Janus per creare una sessione Janus
var janus = null;
//Info sul link al server
var server = null;
//handle_vr: Handler publisher Webcam associato al plugin VideoRoom
var handle_vr = null;

var opaqueId = "videoroomtest-"+Janus.randomString(12);


var myid = null;
var mypvtid = null;
var username = null;

//remotefeed: handler subscriber associato al plugin videoroom - 
var remoteFeed = null;

var subscriptions = {};
//maxPublisher: numero massimo di publisher, lo definisce chi crea la room
const maxPublisher = 200;
var published = true;

var capture = null;
var room = null;
var feeds = {}, feedStreams = {}, subStreams = {}, slots = {}, mids = {};
var localTracks = {}, localVideos = 0, remoteTracks = {};


window.onresize=recalculateLayout;


/*-----------------------------------------------HANDLER PUBLISHER WEBCAM----------------------------------------------------------------------- */

if(window.location.protocol === 'http:')
	server = "http://" + window.location.hostname + ":8088/janus";
else
    server = "https://" + window.location.hostname + ":8089/janus";





$(document).ready(function() {
    Janus.init({
        debug: "all",
        callback: function() {
                // Done!
                if(!Janus.isWebrtcSupported()) {
                    bootbox.alert("No WebRTC support... ");
                    return;
                }
                janus = new Janus(
					{
                    
                    server: server,
                    success: function(){
						//the session was successfully created and is ready to be used;
						//
						shareScreenHandler();
						
						janus.attach(
						{
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
                                
                            },
                            
                            iceState: function(state) {
                                Janus.log("ICE state changed to " + state);
                            },
                            mediaState: function(medium, on, mid) {
								Janus.log("Janus " + (on ? "started" : "stopped") + " receiving our " + medium + " (mid=" + mid + ")");
							},
							webrtcState: function(on) {
                                Janus.log("Janus says our WebRTC PeerConnection is " + (on ? "up" : "down") + " now");
                            },
                            
                            onmessage: function(msg, jsep) {
                                Janus.debug(" ::: Got a message (publisher) :::", msg);
                                //event è l'evento (associato al parametro "videoroom" nella risposta)
                                var event = msg["videoroom"];
                                Janus.debug("Event: " + event);
                                if(event != undefined && event != null) {
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
                                        // Any new feed to attach to?
										if(msg["publishers"]) {
												var list = msg["publishers"];
												Janus.debug("Got a list of available publishers/feeds:", list);
												var sources = null;
												for(var f in list) {
													var id = list[f]["id"];
													if(id==ss_myid) continue;
													var display = list[f]["display"];
													var streams = list[f]["streams"];
													for(var i in streams) {
														var stream = streams[i];
														stream["id"] = id;
														stream["display"] = display;
													}
													feedStreams[id] = {
														id: id,
														display: display,
														streams: streams
													}
													Janus.debug("  >> [" + id + "] " + display + ":", streams);
													if(!sources)
														sources = [];
													sources.push(streams);
												}
												if(sources)
													subscribeTo(roomid,sources);
										}
                                        
                                    } else if(event === "destroyed") {
                                        // The room has been destroyed
                                        Janus.warn("The room has been destroyed!");
                                        bootbox.alert("The room has been destroyed", function() {
                                            window.location.reload();
                                        });
                                    } else if(event === "event") {
                                        // Any new feed to attach to?
                                        if(msg["streams"]) {
                                            var streams = msg["streams"];
                                            for(var i in streams) {
                                                var stream = streams[i];
                                                stream["id"] = myid;
                                                stream["display"] = username;
                                            }
                                            feedStreams[myid] = {
                                                id: myid,
                                                display: username,
                                                streams: streams
                                            }
                                        } else if(msg["publishers"]) {
                                            var roomid =  msg["room"];
                                            var list = msg["publishers"];
                                            Janus.debug("Got a list of available publishers/feeds:", list);
                                            var sources = null;
                                            for(var f in list) {
												var id = list[f]["id"];
												if(id==ss_myid) continue;
                                                var display = list[f]["display"];
                                                var streams = list[f]["streams"];
                                                for(var i in streams) {
                                                    var stream = streams[i];
                                                    stream["id"] = id;
                                                    stream["display"] = display;
                                                }
                                                feedStreams[id] = {
                                                    id: id,
                                                    display: display,
                                                    streams: streams
                                                }
                                                Janus.debug("  >> [" + id + "] " + display + ":", streams);
                                                if(!sources)
                                                    sources = [];
                                                sources.push(streams);
                                            }
                                            if(sources)
                                                subscribeTo(roomid,sources);
                                        } else if(msg["leaving"]) {
                                             // One of the publishers has gone away?
                                            var leaving = msg["leaving"];
                                            Janus.log("Publisher left: " + leaving);
                                            //leaving è l'id del publisher
                                            unsubscribeFrom(leaving);
                                            
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
                                                        $('#unpublish').html("Publish Webcam" );
                                                        published = false;
                                                    }, 3000);
                                                    
													return;
											}
											unsubscribeFrom(unpublished);
											
                                            
                                            
                                            
                                        } else if(msg["error"]) {
                                            if(msg["error_code"] === 426) {
                                                // This is a "no such room" error: give a more meaningful description
											   /*
												bootbox.alert(
                                                    "<p>Apparently room <code>" + roomid + "</code> (the one this demo uses as a test room) " +
                                                    "does not exist...</p><p>Do you have an updated <code>janus.plugin.videoroom.jcfg</code> " +
                                                    "configuration file? If not, make sure you copy the details of room <code>" + roomid + "</code> " +
                                                    "from that sample in your current configuration file, then restart Janus and try again."
												);
												*/
                                            } else {
                                                bootbox.alert(msg["error"]);
                                            }
										} 
										if (msg["configured"]==="ok"){
											//Ho dovuto mettere l'if e non l'if else perchè
											//questa volta nel mesg vi è "streams"
											Janus.log("configured ciao ")
											
                                            
                                            $('#unpublish').attr("disabled",true);
                                            setTimeout(function(){    
                                                $('#unpublish').attr("disabled",false);
                                                $('#unpublish').html( "Unpublish Webcam");
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
                            onlocaltrack: function(track, on) {
                                
                                
								Janus.log(" ::: Got a local track event :::");
								Janus.log("Local track " + (on ? "added" : "removed") + ":", track);
								// We use the track ID as name of the element, but it may contain invalid characters
								var trackId = track.id.replace(/[{}]/g, "");
								if(!on) {
									// Track removed, get rid of the stream and the rendering
									
									var stream = localTracks[trackId];
									
									Janus.log("deleted local stream:(1):", stream);
									if(stream) {
										try {
											var tracks = stream.getTracks();
											for(var i in tracks) {
												Janus.log("deleted local stream:(2):", stream);
												var mst = tracks[i];
												if(mst)
													mst.stop();
													Janus.log("deleted local stream:(3):", stream);
											}
										} catch(e) {}
									}
									if(track.kind === "video") {
										$('#myvideo' + trackId).remove();
										Janus.log("deleted local stream:(4):", stream);
										localVideos--;
										if(localVideos === 0) {
											// No video, at least for now: show a placeholder
											if($('#videolocal .no-video-container').length === 0) {
												$('#videolocal').append(
													'<div class="no-video-container">' +
														'<i class="fa fa-video-camera fa-5 no-video-icon"></i>' +
														'<span class="no-video-text">No webcam available</span>' +
													'</div>');
											}
										}
									}
									delete localTracks[trackId];
									return;
								}
								// If we're here, a new track was added
								var stream = localTracks[trackId];
								if(stream) {
									// We've been here already
									Janus.log("STREAM NON é NULL");
									return;
                                }
                                
                                
                                $('#JoinedOrCreatedToRoom').addClass("hide");
                                $('#mainPage').addClass("hide");
                                $("#gallery").removeClass("hide"); 
                                $("#myvideo-container").removeClass("hide");                               
                                
                             
								
								if($('#mute').length === 0) {
									// Add a 'mute' button
									$('#bd').append('<button class="btn " id="mute">Mute</button>');
									$('#mute').click(toggleMute);
									// Add an 'unpublish' button
									$('#bd').append('<button class="btn " id="unpublish">Unpublish Webcam</button>');
									$('#unpublish').click(toggleOwnFeed);
									//Add an 'share screen' button
									$('#bd').append('<button class="btn " id="publishScreen">Publish Screen</button>');
									$('#publishScreen').click(toggleOwnFeedScreen);
								}

                                recalculateLayout();
                                
                                
                                    
                                if(track.kind === "audio") {
									// We ignore local audio tracks, they'd generate echo anyway
										if(localVideos === 0) {
											
											// No video, at least for now: show a placeholder
											if($('#myvideo-container .no-video-container').length === 0) {
												$('#myvideo-container').append(
													'<div class="no-video-container">' +
														'<i class="fa fa-video-camera fa-5 no-video-icon"></i>' +
														'<span class="no-video-text">No webcam available</span>' +
													'</div>');
											}
										}
								} else {
										// New video track: create a stream out of it
										localVideos++;
										$('#myvideo-container .no-video-container').remove();
										stream = new MediaStream();
										stream.addTrack(track.clone());
										localTracks[trackId] = stream;
										Janus.log("Created local stream:", stream);
										Janus.log(stream.getTracks());
										Janus.log(stream.getVideoTracks());
										$('#myvideo-container').append('<video class="Video-Stream Webcam rounded centered" id="myvideo' + trackId + '" width=100% autoplay playsinline muted="muted"/><h1 id="displayname">'+username+'</h1>');
										Janus.attachMediaStream($('#myvideo' + trackId).get(0), stream);
										
										recalculateLayout();
										
								}
									                             

                            },
                            onremotetrack: function(track, mid, on) {
                                // The publisher stream is sendonly, we don't expect anything here
                            },
                            oncleanup: function() {
                                Janus.log(" ::: Got a cleanup notification: we are unpublished now :::");
                                delete feedStreams[myid];
                                localTracks = {};
                                localVideos = 0;
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

function joinToRoom(){
	room = parseInt(prompt("Name of the room to join"));
  
   if( isNaN(room) ||room===null) {
	   // Create fields to register
	   bootbox.alert("Please enter an integer value");	
   } else {
	   $("#buttonsPage").addClass("hide");
	   $("#JoinedOrCreatedToRoom").removeClass("hide").show();
	   var JoinedOrCreatedToRoom=document.getElementById("JoinedOrCreatedToRoom");
	   handle_vr.spinner = new Spinner().spin(JoinedOrCreatedToRoom);
	   var register = {
		   request: "join",
		   room: room,
		   ptype: "publisher",
		   display: username
	   };
	   handle_vr.send({ message: register });
   }

}



function newRoom(){
   room = parseInt(prompt("Name of the room to create"));
   
   if(isNaN(room) ||room === null ) {
	   bootbox.alert("Please enter an integer value");
   } else {
	   $("#buttonsPage").addClass("hide");
	   $("#JoinedOrCreatedToRoom").removeClass("hide").show();
	   var JoinedOrCreatedToRoom=document.getElementById("JoinedOrCreatedToRoom");
	   handle_vr.spinner = new Spinner().spin(JoinedOrCreatedToRoom);
	   create_request= {
		   request: "create",
		   room: room,
		   publishers: 100    
	   }
	   handle_vr.send({ message: create_request ,success: function (msg){
		   if (msg["videoroom"]==="created"){
			   var register = {
				   request: "join",
				   room: room,
				   ptype: "publisher",
				   display: username
			   };
			   handle_vr.send({ message: register });

		   }
		  
	   }});

   }

}


function publishOwnFeed(useAudio) {
   handle_vr.createOffer(
	   {
		   // Add data:true here if you want to publish datachannels as well
		   media: { audioRecv: false, videoRecv: false, audioSend: useAudio, videoSend: true },	// Publishers are sendonly
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
				   publishOwnFeed(false);
			   } else {
				   bootbox.alert("WebRTC error... " + error.message);
			   }
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
   

   if(published){
	   // Unpublish our stream
	   var elements = document.getElementsByClassName("Video-Stream Webcam");
	   var len = elements.length
	   for (var i= 0; i<elements.length;i++){
		   elements[i].remove();		
}
	   if((document.getElementsByClassName("Video-Stream Webcam").length==0)){
		   $('#myvideo-container ').addClass("hide");
	   }
	   
	   recalculateLayout();
	   var unpublish = { request: "unpublish" };
	   handle_vr.send({ message: unpublish });
	   localVideos--;

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

//------------------------------------------------------------SCREEN SHARING-PC-------------------------------------------------------//
var ss_handle_vr=null;
var ss_myid=null;
var ss_mypvtid= null;
var publishedScreen=false;
var joined = false;

function shareScreenHandler(){
janus.attach(
	{
		plugin: "janus.plugin.videoroom",
		opaqueId: opaqueId,
		success: function(pluginHandle) {
			ss_handle_vr = pluginHandle;
			Janus.log("Plugin attached! (" + ss_handle_vr.getPlugin() + ", id=" + ss_handle_vr.getId() + ")");
			Janus.log("  -- This is a publisher/manager");
			
			
		},
		error: function(error) {
			Janus.error("  -- Error attaching plugin...", error);
			bootbox.alert("Error attaching plugin... " + error);
		},
		consentDialog: function(on) {
			Janus.debug("Consent dialog should be " + (on ? "on" : "off") + " now");
			
		},
		
		iceState: function(state) {
			Janus.log("ICE state changed to " + state);
		},
		mediaState: function(medium, on, mid) {
			Janus.log("Janus " + (on ? "started" : "stopped") + " receiving our " + medium + " (mid=" + mid + ")");
		},
		webrtcState: function(on) {
			Janus.log("Janus says our WebRTC PeerConnection is " + (on ? "up" : "down") + " now");
		},
		
		onmessage: function(msg, jsep) {
			Janus.debug(" ::: Got a message (publisher) :::", msg);
			//event è l'evento (associato al parametro "videoroom" nella risposta)
			var event = msg["videoroom"];
			Janus.debug("Event: " + event);
			if(event != undefined && event != null) {
				if(event === "joined") {
					joined=true;
					ss_myid = msg["id"];
					//my private id (with janus)
					ss_mypvtid = msg["private_id"];
					//var ss_roomid =  msg["room"];
					publishOwnScreen();
					
				} else if(event === "destroyed") {
					// The room has been destroyed
					Janus.warn("The room has been destroyed!");
					bootbox.alert("The room has been destroyed", function() {
						window.location.reload();
					});
				} else if(event === "event") {
					// Any new feed to attach to?
					if(msg["streams"]) {
					} else if(msg["publishers"]) {
					} else if(msg["leaving"]) {
						
					} else if(msg["unpublished"]) {
						// One of the publishers has unpublished?
						var unpublished = msg["unpublished"];
						Janus.log("Publisher left: " + unpublished);
						if(unpublished === 'ok') {
								// That's us
								ss_handle_vr.hangup();
								$('#publishScreen').attr("disabled",true);
								setTimeout(() => {
									$('#publishScreen').attr("disabled",false);
									$('#publishScreen').html("Publish Screen" );
									publishedScreen = false;
								}, 3000);
								
								return;
						}
					
					} else if(msg["error"]) {
						if(msg["error_code"] === 426) {
						} else {
							bootbox.alert(msg["error"]);
						}
					} 
					if (msg["configured"]==="ok"){
					
		
						$('#publishScreen').attr("disabled",true);
						setTimeout(function(){    
							$('#publishScreen').attr("disabled",false);
							$('#publishScreen').html( "Unpublish Screen");
							publishedScreen = true;
						},3000)
						
						

					}
				}
				
			}
			if(jsep) {
				Janus.debug("Handling SDP as well...", jsep);
				ss_handle_vr.handleRemoteJsep({ jsep: jsep });
				
					
			}
		},
		onlocaltrack: function(track, on) {
			
			
			Janus.log(" ::: Got a local track event :::");
			Janus.log("Local track " + (on ? "added" : "removed") + ":", track);
			// We use the track ID as name of the element, but it may contain invalid characters
			var trackId = track.id.replace(/[{}]/g, "");
			if(!on) {
				// Track removed, get rid of the stream and the rendering
				
				var stream = localTracks[trackId];
				
				Janus.log("deleted local stream:(1):", stream);
				if(stream) {
					try {
						var tracks = stream.getTracks();
						for(var i in tracks) {
							Janus.log("deleted local stream:(2):", stream);
							var mst = tracks[i];
							if(mst)
								mst.stop();
								Janus.log("deleted local stream:(3):", stream);
						}
					} catch(e) {}
				}
				if(track.kind === "video") {
					$('#myvideo' + trackId).remove();
					Janus.log("deleted local stream:(4):", stream);
					localVideos--;
					if(localVideos === 0) {
						// No video, at least for now: show a placeholder
						if($('#videolocal .no-video-container').length === 0) {
							$('#videolocal').append(
								'<div class="no-video-container">' +
									'<i class="fa fa-video-camera fa-5 no-video-icon"></i>' +
									'<span class="no-video-text">No webcam available</span>' +
								'</div>');
						}
					}
				}
				delete localTracks[trackId];
				return;
			}
			// If we're here, a new track was added
			var stream = localTracks[trackId];
			if(stream) {
				// We've been here already
				Janus.log("STREAM NON é NULL");
				return;
			}

			$("#myvideo-containerScreen").removeClass("hide"); 
			
			if(track.kind === "audio") {
				// We ignore local audio tracks, they'd generate echo anyway
					if(localVideos === 0) {
						
						// No video, at least for now: show a placeholder
						if($('#myvideo-containerScreen .no-video-container').length === 0) {
							$('#myvideo-containerScreen').append(
								'<div class="no-video-containerScreen">' +
									'<i class="fa fa-video-camera fa-5 no-video-icon"></i>' +
									'<span class="no-video-text">No webcam available</span>' +
								'</div>');
						}
					}
			} else {
					// New video track: create a stream out of it
					localVideos++;
					$('#myvideo-containerScreen .no-video-container').remove();
					stream = new MediaStream();
					stream.addTrack(track.clone());
					localTracks[trackId] = stream;
					Janus.log("Created local stream:", stream);
					Janus.log(stream.getTracks());
					Janus.log(stream.getVideoTracks());
					$('#myvideo-containerScreen').append('<video class="Video-Stream ScreenSharing rounded centered" id="myvideo' + trackId + '" width=100% autoplay playsinline muted="muted"/><h1 id="displayname">'+username+'</h1>');
					Janus.attachMediaStream($('#myvideo' + trackId).get(0), stream);
					
					recalculateLayout();
					
			}
											 

		},
		onremotetrack: function(track, mid, on) {
			// The publisher stream is sendonly, we don't expect anything here
		},
		oncleanup: function() {
			Janus.log(" ::: Got a cleanup notification: we are unpublished now :::");
			delete feedStreams[myid];
			localTracks = {};
			localVideos = 0;
		}



	
	});
}



function joinToRoomScreen() {
	var register = {
		request: "join",
		room: room,
		ptype: "publisher",
		display: username
	};
	ss_handle_vr.send({ message: register });
    
		
}
function publishOwnScreen(){
	Janus.log("Negotiating WebRTC stream for our screen (capture " + capture + ")");
    ss_handle_vr.createOffer(
        {
			media: { video: capture, audioSend:false, videoRecv:false},	// Screen sharing Publishers are sendonly
            success: function(jsep) {
                Janus.debug("Got publisher SDP!", jsep);
                var publish = { request: "configure",audio:false,video:false};
                ss_handle_vr.send({ message: publish, jsep: jsep });
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
						if(joined){
							publishOwnScreen();
						}else{
							joinToRoomScreen();
						}
						
					}
				},
				window: {
					label: "Pick a window",
					className: "btn-success",
					callback: function() {
						capture = "window";
						if(joined){
							publishOwnScreen();
						}else{
							joinToRoomScreen();
						}
					}
				}
			},
			onEscape: function() {
				
			}
		});
	} else {
		if(joined){
			publishOwnScreen();
		}else{
			joinToRoomScreen();
		}
	}
}

function toggleOwnFeedScreen() {
	// Unpublish our stream
    if(publishedScreen){
		// Unpublish our stream
		var elements = document.getElementsByClassName("Video-Stream ScreenSharing");
		var len = elements.length
		for (var i= 0; i<elements.length;i++){
			elements[i].remove();		
}
		if((document.getElementsByClassName("Video-Stream ScreenSharing").length==0)){
			$('#myvideo-containerScreen ').addClass("hide");
		}
		
		
        recalculateLayout();
	    var unpublish = { request: "unpublish" };
        ss_handle_vr.send({ message: unpublish });
        localVideos--;

    }else{
        
        preShareScreen(true);
        
    }
   
}

//------------------------------------------------------------SUBSCRIBERS--------------------------------------------------------------//





var creatingFeed = false;

function subscribeTo(roomid,sources){
    if(remoteFeed){
        var subscription = prepareSubscribe(sources);

        if(subscription.length === 0) {
			// Nothing to do
			return;
		}
		remoteFeed.send({ message: {
			request: "subscribe",
			streams: subscription
		}});
		return;
    }
    if(creatingFeed) {
		// Still working on the handle
		setTimeout(function() {
			subscribeTo(roomid,sources);
		}, 500);
		return;
    }
    
    creatingFeed = true;
    janus.attach(
		{
			plugin: "janus.plugin.videoroom",
			opaqueId: opaqueId,
			success: function(pluginHandle) {
				remoteFeed = pluginHandle;
				
				Janus.log("Plugin attached! (" + remoteFeed.getPlugin() + ", id=" + remoteFeed.getId() + ")");
				Janus.log("  -- This is a multistream subscriber");
				// Prepare the streams to subscribe to, as an array: we have the list of
				// streams the feed is publishing, so we can choose what to pick or skip
				var subscription = prepareSubscribe(sources);
				// We wait for the plugin to send us an offer
				var subscribe = {
					request: "join",
					room: roomid,
					ptype: "subscriber",
					streams: subscription,
					private_id: mypvtid
				};
				remoteFeed.send({ message: subscribe });
			},
			error: function(error) {
				Janus.error("  -- Error attaching plugin...", error);
				bootbox.alert("Error attaching plugin... " + error);
			},
			iceState: function(state) {
				Janus.log("ICE state (remote feed) changed to " + state);
			},
			webrtcState: function(on) {
				Janus.log("Janus says this WebRTC PeerConnection (remote feed) is " + (on ? "up" : "down") + " now");
			},
			slowLink: function(uplink, lost, mid) {
				Janus.warn("Janus reports problems " + (uplink ? "sending" : "receiving") +
					" packets on mid " + mid + " (" + lost + " lost packets)");
			},
			onmessage: function(msg, jsep) {
				Janus.debug(" ::: Got a message (subscriber) :::", msg);
				var event = msg["videoroom"];
				Janus.debug("Event: " + event);
				var roomid = null;
				if(msg["error"]) {
					bootbox.alert(msg["error"]);
				} else if(event) {
					if(event === "attached") {
						creatingFeed = false;
						Janus.log("Successfully attached to feed in room " + msg["room"]);
						roomid = msg["room"];
					} else if(event === "event") {
						
					} else {
						// What has just happened?
					}
				}
				if(msg["streams"]) {
					// Update map of subscriptions by mid
					for(var i in msg["streams"]) {
						var mid = msg["streams"][i]["mid"];
						subStreams[mid] = msg["streams"][i];
						
						var feed = feedStreams[msg["streams"][i]["feed_id"]];
						if(feed && feed.slot) {
							slots[mid] = feed.slot;
							mids[feed.slot] = mid;
						}
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
							media: { audioSend: false, videoSend: false },	// We want recvonly audio/video
							success: function(jsep) {
								Janus.debug("Got SDP!");
								Janus.debug(jsep);
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
			onlocaltrack: function(track, on) {
				// The subscriber stream is recvonly, we don't expect anything here
			},
			onremotetrack: function(track, mid, on) {
				Janus.debug("Remote track (mid=" + mid + ") " + (on ? "added" : "removed") + ":", track);
				// Which publisher are we getting on this mid?
                var sub = subStreams[mid];
				//feed: sarebbe il publisher
				Janus.log("FEEDID STAMP", sub.feed_id);
				var feed = feedStreams[sub.feed_id];
				Janus.debug(" >> This track is coming from feed " + sub.feed_id + ":", feed);
                var slot = slots[mid];
                //se non ho assegnato prima lo slot a tale stream nella subscribe, lo assegno adesso
				if(feed && !slot) {
                    slot = feed.slot;
                    //gli assegno lo slot destinato al publisher
					slots[mid] = feed.slot;
					mids[feed.slot] = mid;
				}
				Janus.debug(" >> mid " + mid + " is in slot " + slot);
				if(!on) {
					// Track removed, get rid of the stream and the rendering
					var stream = remoteTracks[mid];
					if(stream) {
						try {
							var tracks = stream.getTracks();
							for(var i in tracks) {
								var mst = tracks[i];
								if(mst)
									mst.stop();
							}
						} catch(e) {}
					}

					$('#remotevideo' + slot + '-' + mid).remove();
					
					if(track.kind === "video" && feed) {
						feed.remoteVideos--;
						if(feed.remoteVideos === 0) {
                            //bisogna considerare anche il caso in cui non vi è nemmeno l'audio, in tal caso il video container viene distrutto
							// No video, at least for now: show a placeholder
							
							$('#videoremote' + slot).remove();

						}
					}
					delete remoteTracks[mid];
					delete slots[mid];
					delete mids[slot];
					recalculateLayout();
					return;
				}
				
				
				if(track.kind === "audio") {
					
                    if ( ! $('#videoremote' + slot).length){
                        $("#gallery").append('<div class="video-container" id="videoremote'+slot+'"></div>');
					}
					if ( ! $('#remotevideo' + slot + '-' + mid).length){
						// New audio track: create a stream out of it, and use a hidden <audio> element
						stream = new MediaStream();
						stream.addTrack(track.clone());
						remoteTracks[mid] = stream;
                    	Janus.log("Created remote audio stream:", stream);
						$('#videoremote' + slot).append('<audio class="hide" id="remotevideo' + slot + '-' + mid + '" autoplay playsinline/>');
						Janus.attachMediaStream($('#remotevideo' + slot + '-' + mid).get(0), stream);
						if(feed.remoteVideos === 0) {
							// No video, at least for now: show a placeholder
							if($('#videoremote' + slot + ' .no-video-container').length === 0) {
								$('#videoremote' + slot).append(
									'<div class="no-video-container">' +
										'<i class="fa fa-video-camera fa-5 no-video-icon"></i>' +
										'<span class="no-video-text">No remote video available</span>' +
									'</div>');
							}
						}
					}
					
				} else {
					// New video track: create a stream out of it
					Janus.log("SLOT STAMP", slot);
					if ( ! $('#videoremote' + slot).length){
                        $("#gallery").append('<div class="video-container" id="videoremote'+slot+'"></div>');
                    }
                    
                    if ( ! $('#remotevideo' + slot + '-' + mid).length){
						if(feed.remoteVideos === 0)
                        	$('#videoremote' + slot + ' .no-video-container').remove();
                    	feed.remoteVideos++;
						stream = new MediaStream();
						stream.addTrack(track.clone());
						remoteTracks[mid] = stream;
						Janus.log("Created remote video stream:", stream);
						$('#videoremote' + slot).append('<video class="Video-Stream rounded centered" id="remotevideo' + slot + '-' + mid + '" width=100% autoplay playsinline/><h1>'+feed.display+'</h1> ');

						Janus.attachMediaStream($('#remotevideo' + slot + '-' + mid).get(0), stream);
						recalculateLayout();
					}
                    
					
					
				}
			},
			oncleanup: function() {
                Janus.log(" ::: Got a cleanup notification (remote feed) :::");
                var cont = document.getElementsByTagName("video").length;
				for(var i=1;i<cont;i++) {
					$('#remotevideo'+i).remove();
					feedStreams[i].remoteVideos=0;
					
				}
				remoteTracks = {};
			}
		});


}


function prepareSubscribe(sources){
    // Prepare the streams to subscribe to, as an array: we have the list of
		// streams the feeds are publishing, so we can choose what to pick or skip
        
        //subscription: sarà il contenuto del messaggio subscribe che stiamo preparando
        var subscription = [];
		for(var s in sources) {
            //streams: è il vettore di stream di un feed (un publisher sarebbe)
			var streams = sources[s];
			for(var i in streams) {
                //stream: singolo stream di un feed
				var stream = streams[i];
				// If the publisher is VP8/VP9 and this is an older Safari, let's avoid video
				if(stream.type === "video" && Janus.webRTCAdapter.browserDetails.browser === "safari" &&
						(stream.codec === "vp9" || (stream.codec === "vp8" && !Janus.safariVp8))) {
					toastr.warning("Publisher is using " + stream.codec.toUpperCase +
						", but Safari doesn't support it: disabling video stream #" + stream.mindex);
					continue;
                }
                //stream disabled: uno stream di un feed che in questo momento è disabilitato
				if(stream.disabled) {
					Janus.log("Disabled stream:", stream);
					// TODO Skipping for now, we should unsubscribe
					continue;
                }
                //id (sarebbe il feed_id): identifica il publisher
                //mid: identifica il particolare stream del feed
				if(subscriptions[stream.id] && subscriptions[stream.id][stream.mid]) {
					Janus.log("Already subscribed to stream, skipping:", stream);
					continue;
				}
                // Find an empty slot in the UI for each new source
                
                
				// Find an empty slot in the UI for each new source
                if(!feedStreams[stream.id].slot) {
                    var slot;
                    for(var i=1;i<maxPublisher;i++) {
                        if(!feeds[i]) {
                            slot = i;
                            feeds[slot] = stream.id;
                            feedStreams[stream.id].slot = slot;
                            feedStreams[stream.id].remoteVideos = 0;
                            
                            break;
                        }
                    }
                }


				subscription.push({
					feed: stream.id,	// This is mandatory
					mid: stream.mid		// This is optional (all streams, if missing)
                });
                
				if(!subscriptions[stream.id])
					subscriptions[stream.id] = {};
                subscriptions[stream.id][stream.mid] = true;
                
			}
        }
        return subscription;
		
}

function unsubscribeFrom(id) {
	// Unsubscribe from this publisher
	var feed = feedStreams[id];
	if(!feed)
		return;
	Janus.debug("Feed " + id + " (" + feed.display + ") has left the room, detaching");
	
	delete feeds[feed.slot];
	feeds.slot = 0;
	delete feedStreams[id];
	// Send an unsubscribe request
	var unsubscribe = {
		request: "unsubscribe",
		streams: [{ feed: id }]
	};
	if(remoteFeed != null)
		remoteFeed.send({ message: unsubscribe });
	delete subscriptions[id];
	
	$('#videoremote' + feed.slot).remove();
	
	recalculateLayout();
}


/** -----------------------------------RECALCULATE LAYOUT------------------------------------------------------------------------------- */


function recalculateLayout() {
	Janus.log("RECALCUL");
  
  const aspectRatio = 16 / 9;

  const screenWidth = document.body.getBoundingClientRect().width;
  const screenHeight = (document.body.getBoundingClientRect().height);
  const videoCount1 = document.getElementsByClassName("Video-Stream").length;
  const videoCount2 = document.getElementsByClassName("Video-Stream hide").length;

  Janus.log("calcolo",videoCount1-videoCount2);

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
