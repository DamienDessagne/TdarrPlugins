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
    Description: 'Adds transcoded tracks for specified audio codecs while retaining original streams.',
    Version: '1.0',
    Tags: 'action,audio',
    Inputs: [
        {
            name: 'targetCodec',
            type: 'string',
            label: 'Target Codec',
            defaultValue: 'aac',
            inputUI: {
                type: 'dropdown',
                options: [
                    'aac',
                    'ac3',
                    'eac3',
                    'mp3',
                    'opus',
                    'flac',
                    'vorbis',
                    'truehd',
                ],
            },
            tooltip: 'Select the codec to which the audio tracks should be converted.',
        },
        {
            name: 'codecsToConvert',
            type: 'string',
            label: 'Codecs to Convert',
            defaultValue: 'truehd,eac3,dts',
            tooltip: 'Comma-separated list of codecs to convert.',
        },
    ],
});

// Plugin logic (functionality)
const plugin = (file, libraryOptions, inputs) => {
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
    
    const pluginWatermark = "[Tdarr:add_transcoded_audio_tracks:processed]";
	
	log("--- Starting Add Transcoded Audio Tracks plugin on " + file.file + " ...");

    // Retrieve the list of codecs to convert and the target codec from the inputs
    const codecsToConvert = inputs.codecsToConvert ? inputs.codecsToConvert.split(',').map(c => c.trim().toLowerCase()) : ['truehd', 'eac3', 'dts'];
    const targetCodec = inputs.targetCodec || 'aac';

    // Define bitrate limitations for specific codecs
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
    const newAudioTracks = [];
    let audioTrackIndex = -1;
    let newAudioTrackIndex = -1;
    audioTracks.forEach((track) => {
        audioTrackIndex += 1;
        newAudioTrackIndex += 1;
        
        newAudioTracks.push(`-map 0:a:${audioTrackIndex} -c:a:${newAudioTrackIndex} copy`); // Copy the original audio track
        
        // Skip if the track is already in the target codec
        if (track.codec_name.toLowerCase() === targetCodec) {
            log("Track " + audioTrackIndex + " is already in a target codec (" + track.codec_name + ").");
            return; // No need to transcode this track
        }

        if (codecsToConvert.includes(track.codec_name.toLowerCase())) {
            newAudioTrackIndex += 1; // -> Put the transcoded track right after the original one
            
            log("Track " + audioTrackIndex + " is in a codec to convert (" + track.codec_name + "), adding the transcoded track right after...");
            let bitrate = track.bit_rate ? parseInt(track.bit_rate, 10) : 128000; // Default to 128 kbps if bitrate is undefined
            let channels = track.channels || 2; // Default to stereo if channels are undefined
            const lang = track.tags && track.tags.language ? track.tags.language : 'und';
            const title = (track.tags && track.tags.title ? track.tags.title + ' -> ' : lang.toUpperCase()) + ` ${targetCodec.toUpperCase()} ${channels}ch ${bitrate/1000}kbps [Auto]`;

            // Adjust channels based on codec limitations
            if (targetCodec === 'ac3' && channels > 6) {
                channels = 6; // AC3 supports a maximum of 6 channels
            } else if (targetCodec === 'mp3' && channels > 2) {
                channels = 2; // MP3 supports a maximum of 2 channels
            }

            // Adjust bitrate based on codec limitations
            if (codecBitrateLimits[targetCodec] && bitrate > codecBitrateLimits[targetCodec]) {
                bitrate = codecBitrateLimits[targetCodec];
            }

            // Create ffmpeg command to add the target codec track
            newAudioTracks.push(`-map 0:a:${audioTrackIndex}`); // Map the original audio track
            newAudioTracks.push(`-c:a:${newAudioTrackIndex} ${targetCodec}`); // Set the new track's target codec
            newAudioTracks.push(`-b:a:${newAudioTrackIndex} ${bitrate}`); // Set bitrate
            newAudioTracks.push(`-ac:${newAudioTrackIndex} ${channels}`); // Set channels
            newAudioTracks.push(`-metadata:s:a:${newAudioTrackIndex} language=${lang}`); // Set language
            newAudioTracks.push(`-metadata:s:a:${newAudioTrackIndex} 'title=${title}'`); // Set track title
        }
        else {
            log("Track " + audioTrackIndex + " doesn't require transcoding (" + track.codec_name + ").");
        }
    });

    // If new audio tracks were created, build the ffmpeg command
    if (newAudioTrackIndex > audioTrackIndex) {
        response.processFile = true;
        response.preset = ',' + 
            '-map 0:v -c:v copy ' + // Copy video stream without re-encoding
            newAudioTracks.join(' ') + ' ' + // Add audio tracks
            '-map 0:s? -c:s copy ' + // Copy subtitles
            '-metadata \'copyright=' + copyrightData + pluginWatermark + '\''; // Add plugin watermark
        log(`Added ${newAudioTrackIndex-audioTrackIndex} transcoded ${targetCodec.toUpperCase()} tracks to audio streams`);
    } else {
        log("Nothing to convert.");
    }

    return response;
};

// Export the plugin (details and functionality)
module.exports.details = details;
module.exports.plugin = plugin;
