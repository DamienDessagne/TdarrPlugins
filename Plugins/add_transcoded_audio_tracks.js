/**
 * Tdarr Plugin: Add Transcoded Audio Tracks
 * Description: This plugin adds a transcoded version of each audio track that is not already in the target codec,
 * retaining the channels, bitrate, and language of the original track. The codecs to convert can be defined in the Tdarr web interface.
 */

// Plugin details (metadata)
const details = () => ({
	id: 'add_transcoded_audio_tracks',
	Stage: 'Pre-processing',
	Name: 'Add Transcoded Audio Tracks',
	Type: 'Audio',
	Operation: 'Transcode',
	Description: 'Adds transcoded tracks for specified audio codecs, retaining or replacing original streams.',
	Version: '1.0',
	Tags: 'audio only,ffmpeg,pre-processing,configurable',
	Inputs: [
		{
			name: 'codecsToConvert',
			type: 'string',
			defaultValue: 'truehd,eac3,dts',
			tooltip: 'Comma-separated list of codecs to convert.',
		},
		{
			name: 'targetCodec',
			type: 'string',
			defaultValue: 'ac3',
			inputUI: {
				type: 'dropdown',
				options: [
					'aac',
					'ac3',
					'eac3',
					'flac',
					'libmp3lame',
					'libopus',
					'truehd',
					'libvorbis',
					'custom',
				],
			},
			tooltip: 'Select the target codec to which the audio tracks should be converted. If "custom" is selected, customTargetCodec\'s value will be used.',
		},
		{
			name: 'customTargetCodec',
			type: 'string',
			defaultValue: '',
			tooltip: 'When "custom" is selected as a target codec, this is the codec to which the audio tracks will be converted to. You can use the command ffmpeg -encoders for a list of encoders',
		},
		{
			name: 'maxChannels',
			type: 'int',
			defaultValue: '-1',
			inputUI: {
				type: 'dropdown',
				options: [
					'-1',
					'1',
					'2',
					'3',
					'6',
					'8',
				],
			},
			tooltip: 'Maximum number of channels. -1 = same as original track. AC3 is already limited internally to 6 channels, and MP3 to 2.',
		},
		{
			name: 'maxBitrate',
			type: 'int',
			defaultValue: '-1',
			tooltip: 'Maximum bitrate in bps. -1 = keep the original track bitrate. AC3 is already limited internally to 640kbps, and MP3 to 320kbps.',
		},
		{
			name: 'losslessDefaultBitrate',
			type: 'int',
			defaultValue: '640000',
			tooltip: 'Bitrate to default to when original audio track is in a lossless format, in bps.',
		},
		{
			name: 'overwriteTrack',
			type: 'boolean',
			defaultValue: 'false',
			inputUI: {
				type: 'dropdown',
				options: [
					'true',
					'false',
				],
			},
			tooltip: 'Whether to overwrite the original audio track with the transcoded track (true), or add the transcoded audio track after the original audio track (false)',
		},
	],
});

// Plugin logic (functionality)
const plugin = (file, libraryOptions, inputs) => {
	const lib = require('../methods/lib')();
	// eslint-disable-next-line @typescript-eslint/no-unused-vars,no-param-reassign
	inputs = lib.loadDefaultValues(inputs, details);
	const response = {
		processFile: false, // Set to true if the file needs processing
		container: `.${file.container}`,
		handBrakeMode: false,
		FFmpegMode: true,
		infoLog: '',
	};

	// Log utility function
	function log(entry) {
		console.log(entry);
		response.infoLog += entry + "\n";
	}
	
	log(`--- Starting Add Transcoded Audio Tracks plugin on ${file.file} ...`);

	// Retrieve the list of codecs to convert and the target codec from the inputs
	const codecsToConvert = inputs.codecsToConvert.split(',').map(c => c.trim().toLowerCase());
	const targetCodec = inputs.targetCodec === 'custom' ? inputs.customTargetCodec : inputs.targetCodec;
	const maxChannels = inputs.maxChannels;
	const maxBitrate = inputs.maxBitrate;
	const losslessDefaultBitrate = inputs.losslessDefaultBitrate;
	const overwriteTrack = inputs.overwriteTrack === 'true';
	
	const pluginWatermark = `[Tdarr:add_transcoded_audio_tracks:${details().Version}:${codecsToConvert.join('|')}:${targetCodec}]`;
	
	// Define limitations for specific codecs
	const codecChannelsLimits = {
		ac3: 6, // AC3 maximum channels is 6
		mp3: 2, // AC3 maximum channels is 6
	};
	const codecBitrateLimits = {
		ac3: 640000, // AC3 maximum bitrate is 640 kbps
		mp3: 320000, // MP3 maximum bitrate is 320 kbps
	};

	// Check if the file is valid for processing
	log("Checking for ffProbeData...");
	if (!file.ffProbeData || !file.ffProbeData.streams) {
		log('Invalid file for processing, FFProbe data missing');
		return response;
	}

	// Check plugin didn't process the file already
	let copyrightData = file.ffProbeData.format && file.ffProbeData.format.tags && file.ffProbeData.format.tags.COPYRIGHT || '';
	if (copyrightData.includes(pluginWatermark)) {
		log('Plugin watermark found -> file already processed. Aborting.');
		return response;
	}

	// Extract audio tracks data
	log("FFProbeData present, extracting audio tracks data...");
	const audioTracks = file.ffProbeData.streams.filter(stream => stream.codec_type === 'audio');
	if (audioTracks.length === 0) {
		log('No audio tracks, nothing to do');
		return response;
	}
	log(audioTracks.length + " audio tracks");
	
	// Check each audio track
	const audioTracksCommands = [];
	let inputAudioTrackIndex = -1;
	let outputAudioTrackIndex = -1;
	let requireTranscode = false;
	audioTracks.forEach((track) => {
		inputAudioTrackIndex += 1;
		outputAudioTrackIndex += 1;
		
		// Transcode track if needed
		if (codecsToConvert.includes(track.codec_name.toLowerCase())) {
			log(`Track ${inputAudioTrackIndex} is in a codec to convert (${track.codec_name.toUpperCase()})`);
			requireTranscode = true;
			
			// Prepare transcoded track parameters
			let bitrate = track.bit_rate ? parseInt(track.bit_rate) : losslessDefaultBitrate; // Default to losslessDefaultBitrate if bitrate is undefined
			let channels = track.channels || 2; // Default to stereo if channels are undefined
			const lang = track.tags && track.tags.language ? track.tags.language : 'und';

			// Adjust based on codec limitations
			if(codecChannelsLimits[targetCodec] && channels > codecChannelsLimits[targetCodec]) {
				log(`Downmixing to ${codecChannelsLimits[targetCodec]}ch from ${channels}ch since ${targetCodec} limits channels to ${codecChannelsLimits[targetCodec]}`);
				channels = codecChannelsLimits[targetCodec];
			}
			if (codecBitrateLimits[targetCodec] && bitrate > codecBitrateLimits[targetCodec]) {
				log(`Limiting bitrate to ${codecBitrateLimits[targetCodec]}bps from ${bitrate}bps since ${targetCodec} limits bitrate to ${codecBitrateLimits[targetCodec]}`);
				bitrate = codecBitrateLimits[targetCodec];
			}

			// Adjust based on user-specified limitations
			if(maxChannels > 0 && channels > maxChannels) {
				log(`Limiting channels to ${maxChannels}ch as stipulated by the user.`);
				channels = maxChannels;
			}
			if(maxBitrate > 0 && bitrate > maxBitrate) {
				log(`Limiting bitrate to ${maxBitrate}bps as stipulated by the user.`);
				bitrate = maxBitrate;
			}
			
			// Prepare track title
			const title = (track.tags && track.tags.title ? track.tags.title + ' -> ' : lang.toUpperCase() + ' ') + `${targetCodec.toUpperCase()} ${channels}ch ${bitrate/1000}kbps [Auto]`;

			// Copy original track if no overwrite required
			if(!overwriteTrack) {
				log('Copying original audio track');
				audioTracksCommands.push(`-map 0:a:${inputAudioTrackIndex} -c:a:${outputAudioTrackIndex} copy`); // Copy the original audio track
				outputAudioTrackIndex += 1;
			}
			
			// Create ffmpeg command to add the target codec track
			log('Adding transcoded audio track');
			audioTracksCommands.push(`-map 0:a:${inputAudioTrackIndex}`); // Map the original audio track
			audioTracksCommands.push(`-c:a:${outputAudioTrackIndex} ${targetCodec}`); // Set the new track's target codec
			audioTracksCommands.push(`-b:a:${outputAudioTrackIndex} ${bitrate}`); // Set bitrate
			audioTracksCommands.push(`-ac:a:${outputAudioTrackIndex} ${channels}`); // Set channels
			audioTracksCommands.push(`-metadata:s:a:${outputAudioTrackIndex} 'language=${lang}'`); // Set language
			audioTracksCommands.push(`-metadata:s:a:${outputAudioTrackIndex} "title=${title}"`); // Set track title
		}
		else { // -> copy the original track
			log(`Track ${inputAudioTrackIndex} doesn't require transcoding (${track.codec_name.toUpperCase()}), copying the original track`);
			audioTracksCommands.push(`-map 0:a:${inputAudioTrackIndex} -c:a:${outputAudioTrackIndex} copy`); // Copy the original audio track
		}
	});

	// If new audio tracks were created, build the ffmpeg command
	if (requireTranscode) {
		response.processFile = true;

		// --- FIX FOR UNSUPPORTED SUBTITLES ---
		// We only map subtitle streams that have a valid codec name identified by FFprobe.
		const subtitleStreams = file.ffProbeData.streams.filter(s => s.codec_type === 'subtitle');
		let subtitleCommands = '';

		subtitleStreams.forEach((s, idx) => {
			if (s.codec_name && s.codec_name !== 'none') {
				subtitleCommands += `-map 0:s:${idx} -c:s:${idx} copy `;
			} else {
				log(` -> Subtitle track ${s.index}: Missing codec name. Skipping to prevent crash.`);
			}
		});

		if (subtitleCommands === '') { subtitleCommands = '-sn '; }
		// ----------------------------------------

		response.preset = ',' + 
			'-map 0:v -c:v copy ' + // Copy video stream without re-encoding
			audioTracksCommands.join(' ') + ' ' + // Add audio tracks
			subtitleCommands + // Add subtitles
			'-metadata "copyright=' + copyrightData + pluginWatermark + '"'; // Add plugin watermark
	} else {
		log("Nothing to convert.");
	}

	return response;
};

// Export the plugin (details and functionality)
module.exports.details = details;
module.exports.plugin = plugin;
