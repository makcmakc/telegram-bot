const TelegramBot = require('node-telegram-bot-api')
const config = require('./config')
const mongoose = require('mongoose')
const geolib = require('geolib')
const _ = require('lodash')
const helper = require('./utils/index')
const kb = require('./utils/keyboard.buttons')
const keyboard = require('./utils/keyboard')
const database = require('../database.json')

require('./models/film.model')
require('./models/cinema.model')
require('./models/user.model')

helper.logStart()

mongoose.connect(config.DB_URL, {
	useNewUrlParser: true,
	useUnifiedTopology: true
})
	.then(() => console.log('MongoDB connected'))
	.catch(err => console.log(err))


const Film = mongoose.model('films')
const Cinema = mongoose.model('cinemas')
const User = mongoose.model('user')

const ACTION_TYPE = {
  CINEMA_FILMS: 'cfs',
  FILM_CINEMAS: 'fcs',
  CINEMA_LOCATION: 'cl',
  FILM_TOGGLE_FAV: 'ftf'
}

// database.films.forEach(f => new Film(f).save())
// database.cinemas.forEach(c => new Cinema(c).save().catch(err => console.log(err)))

const bot = new TelegramBot(config.TOKEN, {
  polling: true
})

bot.on('message', msg => {

	const chatId = helper.getChatId(msg)

	switch(msg.text) {
		case kb.home.favorite:
			showFavoriteFilms(chatId, msg.from.id)
			break
		case kb.home.films:
			bot.sendMessage(chatId, 'Выберите жанр: ', {
				reply_markup: {keyboard: keyboard.films}
			})
			break
		case kb.film.comedy:
			sendFilmByQuery(chatId, {type: 'comedy'})
			break
		case kb.film.action:
			sendFilmByQuery(chatId, {type: 'action'})
			break
		case kb.film.random:
			sendFilmByQuery(chatId, {})
			break
		case kb.home.cinemas:
			bot.sendMessage(chatId, `Отправить местоположение`, {
				reply_markup: {
					keyboard: keyboard.cinemas
				}
			})
			break
		case kb.back:
			bot.sendMessage(chatId, 'Что хотите посмотреть?', {
				reply_markup: {keyboard: keyboard.home}
			})		
			break
	}

	if (msg.location) {
		console.log(msg.location)
		getCinemasInCoords(chatId, msg.location)
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

bot.onText(/\/f(.+)/, (msg, [source, match]) => {
	const filmUuid = helper.getItemUuid(source)
	const chatId = helper.getChatId(msg)

	Promise.all([
		Film.findOne({uuid: filmUuid}),
		User.findOne({ telegramId: msg.from.id })
	]).then(([film, user]) => {

		let isFavorite = false

		if (user) {
			isFavorite = user.films.indexOf(film.uuid) !== -1
		}

		const favText = isFavorite ? 'Удалить из избранного' : 'Добваить в избранное'



		bot.sendPhoto(chatId, film.picture, {
			caption: `
				Название: ${film.name}\n
				Год: ${film.year}\n
				Рейтинг: ${film.rate}\n
				Длительность: ${film.length}\n
				Страна: ${film.country}\n`,
			reply_markup: {
				inline_keyboard: [
					[
						{
							text: favText,
							callback_data: JSON.stringify({
								type: ACTION_TYPE.FILM_TOGGLE_FAV,
								filmUuid: film.uuid,
								isFav: isFavorite
							})
						},
						{
							text: 'Показать кинотеатры',
							callback_data: JSON.stringify({
								type: ACTION_TYPE.FILM_CINEMAS,
								cinemaUuids: film.cinemas
							})
						}
					],
					[
						{
							text: `Кинопоиск: ${film.name}`,
							url: film.link							
						}
					]
				]
			}
		})
	}).catch(e => console.log(e))
})

bot.onText(/\/c(.+)/, (msg, [source, match]) => {
	const cinemaUuid = helper.getItemUuid(source)
	const chatId = helper.getChatId(msg)

	Cinema.findOne({uuid: cinemaUuid}).then(cinema => {
		bot.sendMessage(chatId, `Кинотеатр ${cinema.name}`, {
			reply_markup: {
				inline_keyboard: [
					[
						{
							text: cinema.name,
							url: cinema.url
						},
						{
							text: 'Показать на карте',
							callback_data: JSON.stringify({
								type: ACTION_TYPE.CINEMA_LOCATION,
								lat: cinema.location.latitude,
								lon: cinema.location.longitude
							})
						}
					],
					[
						{
							text: 'Показать фильмы',
							callback_data: JSON.stringify({
								type: ACTION_TYPE.CINEMA_FILMS,
								filmUuid: cinema.films
							})
						}
					]
				]
			}
		}).catch(e => console.log(e))
	})
})

bot.on('callback_query', query => {
	const userId = query.from.id
	let data
	try {
		data = JSON.parse(query.data)
	} catch (e) {
		console.log(e)
	}

	const {type} = data

	if (type === ACTION_TYPE.CINEMA_LOCATION) {
		const { lat, lon } = data
		bot.sendLocation(query.message.chat.id, lat, lon)
	} else if (type === ACTION_TYPE.FILM_TOGGLE_FAV) {
		toggleFavoriteFilm(userId, query.id, data)
	} else if (type === ACTION_TYPE.CINEMA_FILMS) {
		sendFilmByQuery(userId, {uuid: {'$in': data.filmUuids}})
	} else if (type === ACTION_TYPE.FILM_CINEMAS) {
		sendFilmCinemasByQuery(userId, {uuid: {'$in': data.cinemaUuids}})
	}
})


bot.on('inline_query', query => {
  console.log(query)
  Film.find({}).then(films => {
    const results = films.map(f => {
      return {
        id: f.uuid,
        type: 'photo',
        photo_url: f.picture,
        thumb_url: f.picture,
        caption: `Название: ${f.name}\nГод: ${f.year}\nРейтинг: ${f.rate}\nДлинна: ${f.length}\nСтрана: ${f.country}`,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: `Кинопоиск: ${f.name}`,
                url: f.link
              }
            ]
          ]
        }
      }
    })

    bot.answerInlineQuery(query.id, results, {
      cache_time: 0
    })
  })
})


function sendFilmByQuery(chatId, query) {
	Film.find(query).then(films => {
		const html = films.map((film, index) => {
			return `<b>${index + 1}</b>${film.name} - /f${film.uuid}`
		}).join('\n')

		sendHTML(chatId, html, 'films')
	})
}

function sendHTML(chatId, html, kbName = null) {
	const options = {
		parse_mode: 'HTML'
	}
	if (kbName) {
		options['reply_markup'] = {
			keyboard: keyboard[kbName]
		}
	}
	bot.sendMessage(chatId, html, options)	
}

function getCinemasInCoords(chatId, location) {
	Cinema.find({}).then(cinemas => {
		cinemas.forEach(c => {
			c.distance = geolib.getDistance(location, c.location) / 1000
		})

		cinemas = _.sortBy(cinemas, 'distance')

		const html = cinemas.map((c, i) => {
			return `
				<b>${i + 1}</b> ${c.name}. 
				<em>Расстояние</em> - <strong>${c.distance}</strong> км. /c${c.uuid}`
		}).join('\n')
		sendHTML(chatId, html, 'home')
	})
}

function toggleFavoriteFilm(userId, queryId, {filmUuid, isFav}) {

	let userPromise

	User.findOne({telegramId: userId})
		.then(user => {
			if (user) {
				if (isFav) {
					user.films = user.films.filter(fUuid => fUuid !== filmUuid)
				} else {
					user.films.push(filmUuid)
				}
				userPromise = user
			} else {
				userPromise = new User({
					telegramId: userId,
					films: [filmUuid]
				})
			}

			const answerText = isFav ? 'Удалено' : 'Добавлено'

			userPromise.save()
			.then(_ => {
				bot.answerCallbackQuery(queryId, { text: answerText	})
			}).catch(err => console.log(err))
		}).catch(err => console.log(err))
}

function showFavoriteFilms(chatId, telegramId) {
  User.findOne({telegramId})
    .then(user => {

      if (user) {
        Film.find({uuid: {'$in': user.films}}).then(films => {
          let html
          if (films.length) {
            html = films.map(f => {
              return `${f.name} - <b>${f.rate}</b> (/f${f.uuid})`
            }).join('\n')
            html = `<b>Ваши фильмы:</b>\n${html}`
          } else {
            html = 'Вы пока ничего не добавили'
          }

          sendHTML(chatId, html, 'home')
        })
      } else {
        sendHTML(chatId, 'Вы пока ничего не добавили', 'home')
      }
    }).catch(e => console.log(e))
}

function sendFilmCinemasByQuery(userId, query) {
  Cinema.find(query).then(cinemas => {
    const html = cinemas.map((c, i) => {
      return `<b>${i + 1}</b> ${c.name} - /c${c.uuid}`
    }).join('\n')

    sendHTML(userId, html, 'home')
  })
}
