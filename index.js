"use strict";

var Service, Characteristic;
var telnetClient = require("telnet-client");
var pollingtoevent = require('polling-to-event');


module.exports = function(homebridge) {

    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerAccessory("homebridge-adcp-switch", "adcp-switch", ADCPSwitchAccessory);
};


function ADCPSwitchAccessory(log, config) {
    this.log = log;

    this.name                   = config["name"]                    || "ADCP Switch";
    this.checkStatus 	        = config["checkStatus"] 		 	|| "no";
    this.pollingMillis          = config["pollingMillis"]           || 10000;
    this.onCmd                  = config["onCmd"]                   || "power \"on\"";
    this.offCmd                 = config["offCmd"]                  || "power \"off\"";
    this.statusCmd              = config["statusCmd"]		        || "power_status ?";
    this.statusRegex            = config["statusRegex"]		        || "";
    this.host                   = config["host"];
    this.port                   = config["port"];
    this.shellPrompt            = config["shellPrompt"];
    this.timeout                = config["timeout"];

    this.state = false;

    var that = this;

    this.services = {
        AccessoryInformation: new Service.AccessoryInformation(),
        Switch: new Service.Switch(this.name)
    };

    this.services.AccessoryInformation
        .setCharacteristic(Characteristic.Manufacturer, "sony");
    this.services.AccessoryInformation
        .setCharacteristic(Characteristic.Model, "ADCP Switch");

    switch (this.checkStatus) {
        case "yes":
            this.services.Switch
                .getCharacteristic(Characteristic.On)
                .on('get', this.getStatusState.bind(this))
                .on('set', this.setPowerState.bind(this));
            break;
        case "polling":
            this.services.Switch
                .getCharacteristic(Characteristic.On)
                .on('get', function(callback) {callback(null, that.state)})
                .on('set', this.setPowerState.bind(this));
            break;
        default	:
            this.services.Switch
                .getCharacteristic(Characteristic.On)
                .on('set', this.setPowerState.bind(this));
            break;
    }

    // Status Polling
    if (this.checkStatus === "polling") {

        var statusemitter = pollingtoevent(function(done) {
            that.telnetRequest(that.host, that.port, that.shellPrompt, that.timeout, that.statusCmd, function(error, response) {
                if (error) {
                    that.log('Telnet Request function failed: %s', error.message);
                }
                else {
                    done(null, response);
                }
            })
        }, {longpolling:true, interval:that.pollingMillis, longpollEventName:"statuspoll"});

        statusemitter.on("statuspoll", function(data) {
            if (Boolean(that.statusRegex)) {
                var re = new RegExp(that.statusRegex);
                that.state = re.test(data);
            }
            else {
                var binaryState = parseInt(data);
                that.state = binaryState > 0;
            }

            that.services.Switch
                .getCharacteristic(Characteristic.On)
                .setValue(that.state);
        });
    }
}


ADCPSwitchAccessory.prototype.telnetRequest = function (host, port, shellPrompt, timeout, cmd, callback) {

    var callbackMethod = callback;

    var connection = new telnetClient();
        connection.on('ready', function(prompt){
            connection.exec(cmd, function(error, response){
                connection.end().then(function(){
                    callbackMethod(error,response);
                });
            });
        });
        connection.on('timeout', function(){
            callbackMethod(error,'timeout');
        });

        connection.connect({ host: host, port: port, shellPrompt: shellPrompt, timeout: timeout});
};


ADCPSwitchAccessory.prototype.getStatusState = function (callback) {

    var regex = this.statusRegex;

    this.telnetRequest(this.host, this.port, this.shellPrompt, this.timeout, this.statusCmd, function(error, response) {
        if (error) {
            this.log('Telnet get status function failed: %s', error.message);
            callback(error);
        }
        else {
            var powerOn = false;
            if (Boolean(regex)) {
                var re = new RegExp(regex);
                powerOn = re.test(response);
            }
            else {
                var binaryState = parseInt(response);
                powerOn = binaryState > 0;
            }
            callback(null, powerOn);
        }
    }.bind(this));
};


ADCPSwitchAccessory.prototype.setPowerState = function (powerOn, callback) {

    var url;
    var body;

    if (powerOn) {
        cmd = this.onCmd;
    } else {
        cmd = this.offCmd;
    }

    this.telnetRequest(this.host, this.port, this.shellPrompt, this.timeout, this.statusCmd, function(error, response) {
        if (error || response !== 'ok') {
            this.log('Telnet set power function failed: ' + response + ' %s', error.message);
            callback(error);
        }
        else {
            callback();
        }
    }.bind(this));
};


ADCPSwitchAccessory.prototype.getServices = function () {
    return [this.services.AccessoryInformation, this.services.Switch];
};
