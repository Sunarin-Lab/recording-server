import path from 'path';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { AudioRecorder } from './AudioRecorder';
import puppeteer, { Browser, Page } from 'puppeteer';
import { PuppeteerScreenRecorder } from 'puppeteer-screen-recorder';

export class Recorder extends EventEmitter {
    private roomId: string;
    private ownerId: string;
    private audioRecorder!: AudioRecorder;
    private videoRecorder!: PuppeteerScreenRecorder;
    private browser!: Browser;
    private page!: Page;
    public filename: string;
    public folder: string;

    constructor(roomId: string, ownerId: string) {
        super();

        this.roomId = roomId;
        this.ownerId = ownerId;
        var date = new Date();

        this.folder = path.resolve(__dirname + '../../../uploads/').toString();
        this.filename = date.toString() + '-' + roomId;
        console.log(this.folder);
        console.log(this.filename);
    }

    public async setup(): Promise<void> {
        this.browser = await puppeteer.launch({
            headless: true,
            devtools: true,
            ignoreDefaultArgs: ["--mute-audio"],
            executablePath: "/usr/bin/google-chrome-stable",
            args: ["--use-fake-ui-for-media-stream"],
        });

        this.page = await this.browser.newPage();

        this.page.on("dialog", async (dialog) => {
            await dialog.accept("bot");
        });

        await this.page.setViewport({
            width: 1280,
            height: 720,
            deviceScaleFactor: 1,
        });

        await this.page.goto("http://localhost:3000/meet?room=" + this.roomId, { waitUntil: "networkidle0" });

        await this.page.waitForTimeout(3000);

        this.videoRecorder = new PuppeteerScreenRecorder(this.page, {
            followNewTab: true,
            fps: 30,
            videoFrame: {
                width: 1280,
                height: 720,
            },
            aspectRatio: "16:9",
        });

        this.audioRecorder = new AudioRecorder(this.page, this.filename);
        this.audioRecorder.on('file-uploaded', () => {
            this.postProcessing();
        });
        await this.audioRecorder.setupAudioContext();
    }

    private postProcessing() {
        const ffmpeg_script = path.resolve(__dirname + '../../post_processing.sh');
        const $1 = this.folder + '/' + this.filename + "-video.mp4";
        const $2 = this.folder + '/' + this.filename + "-audio.webm"

        const process = spawn('sh', [ffmpeg_script, $1, $2]);

        process.stderr.on('data', (data) => {
            console.error(data.toString());
        });

        process.on('close', (code) => {
            console.log(`child process exited with code ${code}`);
        });
    }

    public async startRecording() {
        var current = new Date();
        this.videoRecorder.start(this.folder + '/' + this.filename + "-video.mp4");
        current = new Date();
        console.log("Video start", current);
        this.audioRecorder.startRecording();
        current = new Date();
        console.log("audio start", current);
        console.log("Recording started");
    }

    public async stopRecording() {
        await this.videoRecorder.stop();
        var current = new Date();
        console.log(current);

        await this.audioRecorder.stopRecording();
        current = new Date();
        console.log(current);

        await this.page.waitForTimeout(30000);
        console.log("Recording stopped");
        await this.browser.close();
    }
}
