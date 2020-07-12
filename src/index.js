const TelegramBot = require('node-telegram-bot-api')
const config = require('./config')
const mongoose = require('mongoose')
const helper = require('./utils/index')
const kb = require('./utils/keyboard.buttons')
const keyboard = require('./utils/keyboard')
const database = require('../database.json')
require('./models/film.model')

helper.logStart()

mongoose.connect(config.DB_URL, {
	useNewUrlParser: true,
	useUnifiedTopology: true
})
	.then(() => console.log('MongoDB connected'))
	.catch(err => console.log(err))


const Film = mongoose.model('films')
// database.films.forEach(f => new Film(f).save())

const bot = new TelegramBot(config.TOKEN, {
  polling: true
})

bot.on('message', msg => {

	const chatId = helper.getChatId(msg)

	switch(msg.text) {
		case kb.home.favorite:
			break
		case kb.home.films:
			bot.sendMessage(chatId, 'Выберите жанр: ', {
				reply_markup: {keyboard: keyboard.films}
			})
			break
		case kb.home.cinemas:
			break						
		case kb.back:
			bot.sendMessage(chatId, 'Что хотите посмотреть?', {
				reply_markup: {keyboard: keyboard.home}
			})		
			break						
	}

})

bot.onText(/\/start/, msg => {
	const text = `Здравствуйте, ${msg.from.first_name}\nВыберите команду для началы работы: `

	bot.sendMessage(helper.getChatId(msg), text, {
		reply_markup: {
			keyboard: keyboard.home
		}
	})
})
