import { EventEmitter } from "events";
import { Page, CDPSession } from "puppeteer";

declare global {
    interface Window {
        audioRecorder: MediaRecorder;
        audioContext: AudioContext;
        gainNode: GainNode;
        audioDestination: MediaStreamAudioDestinationNode;
        onFileUploaded: any;
    }
}

export class AudioRecorder extends EventEmitter {
    private currentPage: Page;
    private currentSession!: CDPSession;
    private destFile: string;

    public constructor(page: Page, destFile: string) {
        super();
        this.currentPage = page;
        this.destFile = destFile;
    }

    public async startRecording() {
        await this.currentPage.evaluate(() => {
            window.audioRecorder.start();
            console.log(window.audioRecorder.stream);
        });
    }

    private async getCDPSessions() {
        try {
            const CDP = await this.currentPage.target().createCDPSession();
            this.currentSession = CDP;
        } catch (err) {
            console.log("Failed to create CDP session");
        }
    }

    public async setupAudioContext() {
        await this.getCDPSessions();
        let session = this.currentSession;
        // Enabling network for listening websocket events
        session.send('Network.enable');
        session.send('Page.enable');
        session.on('Network.webSocketFrameReceived', async (response) => {
            const eventNamePattern = /\".*?\"/;
            const dataPattern = /\{.*\}/;

            var result = response.response.payloadData.match(eventNamePattern);
            var result2 = response.response.payloadData.match(dataPattern);

            if (result == '"new-consumer"') {
                console.log("new user joined");
                var payload = JSON.parse(result2[0]);

                await this.currentPage.evaluate((newPeer) => {
                    var newAudio: any = document.getElementById(newPeer.peerName + newPeer.socketId + "-audio");
                    if (newAudio !== null) {
                        var stream: MediaStream = newAudio.captureStream();
                        stream.onaddtrack = function(e) {
                            if (e.track.kind === "audio") {
                                console.log(stream);
                                console.log(stream.getAudioTracks());

                                var sourceNode = window.audioContext.createMediaStreamSource(stream);
                                sourceNode.connect(window.gainNode);
                                sourceNode.connect(window.audioDestination);
                            }
                        };
                    }

                }, payload)
            }
        })

        await this.currentPage.exposeFunction('onFileUploaded', () => {
            this.emit('file-uploaded');
        });

        // Setup on browser page
        await this.currentPage.evaluate((filename) => {
            window.audioContext = new AudioContext();

            window.gainNode = window.audioContext.createGain();
            window.gainNode.connect(window.audioContext.destination);
            window.gainNode.gain.value = 0;

            window.audioDestination = window.audioContext.createMediaStreamDestination();

            var chunks: any = [];

            var recording_finished = new Event('file-uploaded');
            window.addEventListener('file-uploaded', function(e) {
                console.log('File uploaded');
                window.onFileUploaded();
            });

            window.audioRecorder = new MediaRecorder(window.audioDestination.stream, { mimeType: "audio/webm;codecs=opus" });
            window.audioRecorder.onstop = (e) => {
                var blob = new Blob(chunks, { type: "audio/webm;codecs=opus" });

                var fd = new FormData();
                fd.append('filename', filename);
                fd.append('audioBlob', blob);

                fetch("http://localhost:8080/uploadFile", {
                    method: 'POST',
                    body: fd,
                }).then(result => {
                    console.log(result);
                    if (result.ok) {
                        window.dispatchEvent(recording_finished);
                    }
                }).catch(e => {
                    console.error("Error sending audio blob ", e);
                });
            };

            window.audioRecorder.onerror = function(e) {
                console.log(e);
            };

            window.audioRecorder.ondataavailable = function(e) {
                console.log(e);
                if (e.data.size > 0) chunks.push(e.data);
            };
        }, this.destFile);

        this.getMixedAudioStreams();
    }

    private async getMixedAudioStreams() {
        await this.currentPage.evaluate(() => {
            const audioElements = document.querySelectorAll("audio");
            const audioSources: Array<MediaStreamAudioSourceNode> = [];
            // Connect every stream
            if (audioElements != null) {
                audioElements.forEach((element: any) => {
                    var stream: MediaStream = element.captureStream();

                    var sourceNode = window.audioContext.createMediaStreamSource(stream);
                    sourceNode.connect(window.gainNode);

                    audioSources.push(sourceNode);
                });

                audioSources.forEach((source) => {
                    source.connect(window.audioDestination);
                });
            }
        });
    }

    public async stopRecording() {
        await this.currentPage.evaluate(() => {
            window.audioRecorder.stop();
        });
    }
}
