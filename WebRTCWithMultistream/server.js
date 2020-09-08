var express = require('express');
var app = express();

module.exports = app;
var server = app.listen(4000);
//le richieste ad http vengono elaborate da express


app.get("/mainpage.js",function(req, resp){
  resp.sendFile(__dirname+"/client/mainpage.js")
  console.log("t'appo ho ricevuto una richiesta chat");
  resp.end;
});

app.get("/mainpage.html",function(req, resp){
  resp.sendFile(__dirname+"/client/mainpage.html")
  console.log("t'appo ho ricevuto una richiesta chat");
  resp.end;
});
app.get("/janusFolder/janus.js",function(req, resp){
    resp.sendFile(__dirname+"/client/janusFolder/janus.js")
    console.log("t'appo ho ricevuto una richiesta chat");
    resp.end;
  });

  app.get("/css/demo.css",function(req, resp){
    resp.sendFile(__dirname+"/css/demo.css")
    console.log("t'appo ho ricevuto una richiesta chat");
    resp.end;
  });

 
  app.get("/index.css",function(req, resp){
    resp.sendFile(__dirname+"/client/MyCSS/index.css")
    console.log("t'appo ho ricevuto una richiesta chat");
    resp.end;
  });