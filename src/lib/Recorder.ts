import path from 'path';
import { Response } from 'express';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { mysql_con } from '../db_conn';
import { AudioRecorder } from './AudioRecorder';
import puppeteer, { Browser, Page } from 'puppeteer';
import { PuppeteerScreenRecorder } from 'puppeteer-screen-recorder';

export class Recorder extends EventEmitter {
    private roomId: string;
    private ownerId: string;
    private userId: number;
    private audioRecorder!: AudioRecorder;
    private videoRecorder!: PuppeteerScreenRecorder;
    private browser!: Browser;
    private page!: Page;
    public res!: Response;
    public filename: string;
    public folder: string;

    constructor(roomId: string, ownerId: string, userId: number) {
        super();

        this.roomId = roomId;
        this.ownerId = ownerId;
        this.userId = userId;
        var date = new Date();

        this.folder = path.resolve(__dirname + '../../../uploads/').toString();
        this.filename = date.toString() + '-' + roomId;
        console.log("userID ", this.userId);
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

        await this.page.setViewport({
            width: 1280,
            height: 720,
            deviceScaleFactor: 1,
        });

        await this.page.goto("http://localhost:3000/login", { waitUntil: "networkidle0" });
        await this.page.type('#email', "bot@recording.com");
        await this.page.type('#password', "bot_admin123");
        await this.page.click('#loginButton');
        await this.page.waitForNavigation();

        await this.page.waitForTimeout(3000);

        await this.page.goto("http://localhost:3000/meet/" + this.roomId, { waitUntil: "networkidle0" });

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
        this.audioRecorder.on('file-uploaded', async () => {
            console.log("after upload");
            console.log("Recording stopped");
            await this.browser.close();
            this.postProcessing();
        });
        await this.audioRecorder.setupAudioContext();
    }

    public setResponse(res: Response) {
        this.res = res;
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
            const model = '/home/jikope/deepspeech-0.9.3-models.pbmm';
            const scorer = '/home/jikope/deepspeech-0.9.3-models.scorer';
            const file = this.folder + '/' + this.filename + ".mp4";

            const autosub = spawn('./AutoSub/sub/bin/python3',
                [
                    'AutoSub/autosub/main.py',
                    '--model', model,
                    '--scorer', scorer,
                    '--file', file,
                    '--format', 'srt',
                ]
            );

            autosub.stdout.on('data', (data) => {
                console.log(`stdout ${data}`);
            });

            autosub.stderr.on('data', (data) => {
                console.error(`stdout ${data}`);
            });

            autosub.on('close', (code) => {
                mysql_con.query(`INSERT INTO recordings (user_id, filename) VALUES(${this.userId}, '${this.filename}')`, function(err, results) {
                    if (err) throw err;
                });
                this.res.send({ filename: this.filename });
            });
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
        await this.audioRecorder.stopRecording();
    }
}
