'use strict'

const axios = require('axios');
const inquirer = require('inquirer');
const cheerio = require('cheerio');
const qs = require('querystring');

const base_url = 'http://166.111.214.78';
const Referer = "http://166.111.214.78/Select_Select.php?weekselect=";


function parseExperiment(html) {
	const $ = cheerio.load(html);
	const experiments = [];
	$('tr[bgcolor*="c2cdf8"]').each(function(i, elem) {
		let name = $('a', elem).first().text();
		let id = $('input', elem).last().attr('name');
		experiments.push({name, id});
	});
	return experiments;
}

async function login(username, passwd, cookie) {
	const response = await axios({
		method: 'post',
		url: base_url + '/Select_Login.php',
		data: qs.stringify({
			UserType: 1,
			UserId: username,
			UserPassword: passwd,
		}),
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			'Cookie': cookie,
		}
	});

	if (!response.data.includes('开始选修')) 
		return false;

	return true;
}

function parseWeek(html) {
	const $ = cheerio.load(html);
	return $("font[color*='ff00ff']").first().text();
}

async function selectExp(id, cookie) {

	const response = await axios({
		method: 'get',
		url: base_url + `/Select_Select.php?weekselect=${id}`,
		headers: {
			'Cookie': cookie,
		}
	})

	const wk = parseWeek(response.data);

	let experiments = parseExperiment(response.data), selectQueue = [];

	let chooseExperiment = {
		type: 'checkbox',
		name: 'selected',
		message: `What are the experiments you want to do in the ${wk}th week`,
		choices: []
	}
	for (let experiment of experiments) {
		chooseExperiment.choices.push({
			name: experiment.name,
			value: experiment
		});
	}

	let selectedExperiments = await inquirer.prompt([chooseExperiment]);

	for (let experiment of selectedExperiments.selected) 
		experiment.wk = id;

	return selectedExperiments.selected;
}

async function selectTime(wk) {
	let chooseExperiment = {
		type: 'checkbox',
		name: 'selected',
		message: 'What days are you free in the fourth week',
		choices: []
	}
	const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
		  hours = ['8:30 - 11:50', '13:30 - 16:50', '18:30 - 21:50'];
	for (let i in days)
		for (let j in hours)
			chooseExperiment.choices.push({
				'name': `${days[i]} - ${hours[j]}`,
				'value': `${+i + 1}${+j + 1}`
			});
	let selectedTime = await inquirer.prompt([chooseExperiment]);
	return selectedTime.selected;
}

function parseResults(html) {
	const $ = cheerio.load(html);
	const table = $('table[border*=1]');
	const results = [];
	$('tr', table).each((i, row) => {
		let info = []
		$('td', row).each((j, data) => {
			info.push($(data).text().trim().replace('\n', ' ').replace(/\s+/g, ''));
		});
		$('th', row).each((j, data) => {
			info.push($(data).text().trim().replace('\n', ' ').replace(/\s+/g, ''));
		});
		results.push(info);
	});
	return results;
}

async function showResults(cookie) {
	const html = await axios({
		method: 'get',
		url: base_url + '/Select_Selected.php',
		headers: {
			'Cookie': cookie
		},
	})
		.then(response => response.data)
		.catch((err) => {
			console.log(`update results error: ${err.message}`);
		});

	if (html) {
		console.clear();
		console.log(`update at ${(new Date()).toLocaleString()}`)
		const results = parseResults(html);
		console.table(results.slice(1));
	}
}

async function realFuck(wk, formobj, cookie) {
	await axios({
		method: 'post',
		url: base_url + '/Select_Select.php',
		data: qs.stringify(formobj),
		headers: {
			'Cookie': cookie,
			'Referer': Referer + wk
		}
	})
		.then(response => {
			console.log(`success in ${wk}`);
		})
		.catch((error) => {
			console.log(`failed in ${wk}: ${error.message}`);
		});
}

async function get_cookie(username, password) {
	const cookie = await axios({
		method: 'get',
		url: base_url
	}).then(response => {
		return response.headers['set-cookie'];
	});

	if (!await login(username, password, cookie)) 
		console.log('Login Failed');

	return cookie;
}

async function fuck(cookie, selectQueue, timeQueue1, timeQueue2) {
	const formobj1 = {}, formobj2 = {};

	for (let exp of selectQueue) {
		if (exp.wk == 1) {
			for (let time of timeQueue1) 
				formobj1[exp.id] = time;
		}
		if (exp.wk == 2) {
			for (let time of timeQueue2) 
				formobj2[exp.id] = time;
		}
	}
	//await realFuck(1, formobj1, cookie);
	//await realFuck(2, formobj2, cookie);
	await showResults(cookie);
	setTimeout(() => fuck(cookie, selectQueue, timeQueue1, timeQueue2), 100);
}

(async () => {

	const auth = await inquirer.prompt([{
		name: 'username',
		message: 'Username',
		type: 'input'
	}, {
		name: 'password',
		message: 'Password',
		type: 'password'
	}]);

	const cookie = await get_cookie(auth.username, auth.password);

	let selectQueue = [], timeQueue = [];

	selectQueue.push(...await selectExp(1, cookie));
	let timeQueue1 = await selectTime(1);
	selectQueue.push(...await selectExp(2, cookie));
	let timeQueue2 = await selectTime(2);

	setTimeout(() => fuck(cookie, selectQueue, timeQueue1, timeQueue2), 100);

})();

