#!/usr/bin/env node
"use strict"

/* Imports */
const repl = require("repl")
const facebook = require("facebook-chat-api")

/* Globals */
let api = {}
let user = {}
let lastThread = null

/* Command type constants */
const commandEnum = {
	MESSAGE: "message",
	REPLY: "reply",
	CONTACTS: "contacts",
	HELP: "help"
}

const commandMap = {
	"r": commandEnum.REPLY,
	"m": commandEnum.MESSAGE
}

/* Initialisation */
if (process.argv.length < 3) {
	//	User didn't store credentials in JSON, make them manually enter credentials
	const prompt = require("prompt")
	console.log("Enter your Facebook credentials - your password will not be visible as you type it in")
	prompt.start()

	prompt.get([{
		name: "email",
		required: true
	}, {
		name: "password",
		hidden: true,
		conform() { return true }
	}], (err, result) => { authenticate(result) })

} else {
	const fs = require("fs")
	fs.readFile(process.argv[2], (err, data) => {
		if (err) return console.log(err)

		authenticate(JSON.parse(data))
	})
}

/**
 * Fetches and stores all relevant user details using a promise.
 */
function getUserDetails() {
	console.info("Fetching user details...")
	return new Promise((resolve, reject) => {
		api.getFriendsList((err, data) => {
			if (err) {
				console.error(err)
				reject()
			}
			user.friendsList = data
			resolve()
		})
	})
}

/**
 * Handles incoming messages by logging appropriately.
 */
function handleMessage(message) {
	const unrenderableMessage = ", unrenderable in Messer :("

	// seen message (not sent)
	if (!message.senderID || message.type != "message")
		return

	let sender = user.friendsList.find(f => { return f.userID === message.senderID })
	sender = sender.fullName || "Unknown User"

	if (message.participantNames && message.participantNames.length > 1)
		sender = "'" + sender + "'" + " (" + message.senderName + ")"

	process.stderr.write("\x07")	// Terminal notification

	let messageBody = null

	if (message.body !== undefined && message.body != "") {
		// console.log("New message sender " + sender + " - " + message.body)
		messageBody = " - " + message.body
	}

	if (message.attachments.length == 0) {
		console.log("New message from " + sender + (messageBody || unrenderableMessage))
	} else {
		const attachment = message.attachments[0]//only first attachment
		const attachmentType = attachment.type.replace(/\_/g, " ")
		console.log("New " + attachmentType + " from " + sender + (messageBody || unrenderableMessage))
	}

	lastThread = message.threadID
}

/* command handlers */
const commands = {
  /**
   * Sends message to given user
   */
	message(rawCommand) {
		const quoteReg = /(".*?")(.*)/g
		// to get length of first arg
		const args = rawCommand.replace("\n", "").split(" ")
		const cmd = rawCommand.substring(args[0].length).trim()

		if (cmd.match(quoteReg) == null) {
			console.warn("Invalid message - check your syntax")
			return processCommand("help")
		}

		const decomposed = quoteReg.exec(cmd)
		const rawReceiver = decomposed[1].replace(/"/g, "")
		const message = decomposed[2].trim()

		if (message.length == 0) {
			console.warn("No message to send - check your syntax")
			return processCommand("help")
		}

		// Find the given reciever in the users friendlist
		const receiver = user.friendsList.find(f => {
			return f.fullName.toLowerCase().startsWith(rawReceiver.toLowerCase())
		})

		if (!receiver) {
			console.warn("User \"" + rawReceiver + "\"" + " could not be found in your friends list!")
			return
		}

		api.sendMessage(message, receiver.userID, err => {
			if (err) console.warn("ERROR!", err)

			console.log("Sent message to " + receiver.fullName)
		})
	},

  /**
   * Replies with a given message to the last received thread.
   */
	reply(rawCommand) {
		if (lastThread === null) {
			console.warn("Error - can't reply to messages you haven't yet received! You need to receive a message before using `reply`!")
		}

		const args = rawCommand.replace("\n", "").split(" ")
		const body = rawCommand.substring(args[0].length).trim()

		// var body = rawCommand.substring(commandEnum.REPLY.length).trim()

		api.sendMessage(body, lastThread, err => {
			if (err) return console.error(err)

			console.log("✓")
		})
	},

  /**
   * Displays users friend list
   */
	contacts() {
		user.friendsList.forEach(f => { console.log(f.fullName) })
	},

  /**
   * Displays usage instructions
   */
	help() {
		console.log("Commands:\n" +
			"\tmessage \"[user]\" [message]\n" +
			"\tcontacts\n"
		)
	}
}

/**
 * Execute appropriate action for user input commands
 */
function processCommand(rawCommand) {
	const args = rawCommand.replace("\n", "").split(" ")
	const command = commandMap[args[0]] || args[0]
	const commandHandler = commands[command]

	if (!commandHandler) {
		console.error("Invalid command - check your syntax")
	} else {
		commandHandler(rawCommand)
	}
}

function authenticate(credentials) {
	facebook(credentials, (err, fbApi) => {
		if (err) return console.error(err)

		api = fbApi // assign to global variable
		api.setOptions({ logLevel: "silent" })

		console.info("Logged in as " + credentials.email)

		getUserDetails(api, user).then(() => {
			console.info("Listening for incoming messages...")

			// listen for incoming messages
			api.listen((err, message) => {
				if (err) return console.error(err)
				handleMessage(message)
			})

			// start REPL
			repl.start({
				ignoreUndefined: true,
				eval(cmd) {
					processCommand(cmd)
				}
			})
		})

	})
}
