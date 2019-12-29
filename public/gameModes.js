var gamemodeData = [];

function runGamemode() {
	if (settings.gamemode == 'ctf') {
		gamemodeData.forEach(flag => {
			noStroke();
			fill(flag.color);
			ellipse(flag.pos.x, flag.pos.y, settings.playerSize / 2, settings.playerSize / 2);
		});
	}
}

function initGamemode(gamemode) {
	console.log('Gamemode init: %s', gamemode);
	if (gamemode == 'ctf') {
		socket.on('gamemode_data', function(data) {
			gamemodeData = data;
		});
	}
}