var ROSLIB = require("roslib");
var constants = require("./Constants");

module.exports = function(client, connection) {

    var registeredTopics = {};

    // Internal signature for the topic
    var getSignature = function(name, messageType) {
        return messageType + '/' + name;
    }

    var getTopic = function(name, messageType) {
        var signature = getSignature(name, messageType);
        var topic = registeredTopics[signature]

        if (!topic) {
            topic = registeredTopics[signature] = {
                options: { name: name, messageType: messageType },
                instance: undefined,
                handlers: []
            };
        }

        return topic
    }

    var getTopicInstance = function(ros, name, messageType, compresson) {
        compression = compression || 'none';

        var topic = getTopic(name, messageType);

        if (!topic.instance) {
            topic.instance = new ROSLIB.Topic({
                ros: ros,
                name: name,
                messageType: messageType,
                compression: compression,
            });
        }

        return topic.instance
    }

    var listen = function(ros, name, messageType, compression) {
        compression = compression || 'none';

        var instance = getTopicInstance(ros, name, messageType, compression);


        instance.subscribe(function(message) {
            var topic = getTopic(name, messageType)
            var numHandlers = topic.handlers.length;

            for (var i = 0; i < numHandlers; i++) {
                // Actually invoke topic handlers
                topic.handlers[i](message);
            }
        });
    };

    var connectAndListen = function(name, messageType) {
        return connection.getInstance().then(function(ros) {
            listen(ros, name, messageType);
        });
    };

    this.publish = function(name, messageType, payload) {
        return connection.getInstance().then(function(ros) {
            var message = new ROSLIB.Message(payload);

            getTopicInstance(ros, name, messageType).publish(message);
        });
    };

    this.subscribe = function(name, messageType, handler) {
        var topic = getTopic(name, messageType)

        topic.handlers.push(handler)
        // Start topic subscription
        connectAndListen(name, messageType);

        return {
            dispose: function() {
                var index = topic.handlers.indexOf(handler);
                if (index !== -1) {
                    topic.handlers.splice(index, 1);
                    // Close the topic, because no handlers are left
                    if (!topic.handlers.length && topic.instance) {
                        topic.instance.unsubscribe();
                        topic.instance = null;
                    }
                }
            }
        };
    };

    client.on(constants.EVENT_DISCONNECTED, function() {
        // Dispose all topic instances
        for (signature in registeredTopics) {
            var topic = registeredTopics[signature];
            if (topic.instance) {
                topic.instance.unsubscribe();
                topic.instance = null;
            }
        }
    });

    client.on(constants.EVENT_CONNECTED, function(ros) {
        // Reconnect disconnected handlers
        for (signature in registeredTopics) {
            var topic = registeredTopics[signature];
            if (topic.instance === null && topic.handlers.length) {
                listen(ros, topic.options.name, topic.options.messageType, signature);
                topic.instance = null;
            }
        }
    });
};
