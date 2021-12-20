import fs from 'fs';
import cors from 'cors';
import path from 'path';
import multer from 'multer';
import express from 'express';
import { io } from 'socket.io-client';
import { Recorder } from './lib/Recorder';
import { AudioRecorder } from './lib/AudioRecorder';

const app = express();
const port = 8080;
const socket = io("https://sfu.server:5000", { secure: true });
const recorders: Map<string, Recorder> = new Map<string, Recorder>();
const upload = multer({ dest: '../uploads', storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

(async () => {

    // Websocket endpoints


    // HTTP endpoints
    app.get("/", (req, res) => {
        res.send("Welkam to recording & file server");
    });

    app.post('/recording-create', async (req, res) => {
        const room_id = req.body.room_id;
        const owner_id = req.body.owner_id;

        if (recorders.has(room_id)) {
            return res.status(400).send({ 'error': 'Recorder has already created' });
        }

        const newRecorder = new Recorder(room_id, owner_id);
        recorders.set(room_id, newRecorder);

        try {
            await newRecorder.setup();
            return res.status(201).send({
                'status': true,
                'message': 'Recorder has been created successfully'
            });
        } catch (e) {
            console.error("Failed to create recorder ", e);
            return res.status(500).send({ 'error': 'Failed to create recorder' });
        }
    });

    app.post('/recording-start', async (req, res) => {
        const room_id = req.body.room_id;
        const recorder = recorders.get(room_id);
        if (!recorder) {
            return res.status(500).send({ 'error': 'Recorder not found' });
        }

        await recorder.startRecording();
        return res.sendStatus(200)
    });

    app.post('/recording-stop', async (req, res) => {
        const room_id = req.body.room_id;
        const recorder = recorders.get(room_id);
        if (!recorder) {
            return res.status(500).send({ 'error': 'Recorder not found' });
        }

        await recorder.stopRecording();
        recorders.delete(room_id);
        return res.sendStatus(200);
    });

    app.post("/uploadFile", upload.single('audioBlob'), (req, res) => {
        if (!req.file) {
            return res.send("File not uploaded");
        }

        const folder = path.resolve(__dirname + '/../uploads/').toString();
        const filename = folder + '/' + req.body.filename + '-audio.webm';

        try {
            fs.writeFileSync(filename, req.file.buffer);
            return res.sendStatus(200);
        } catch (err) {
            console.log("error writing Audio file", err);
        }
    })

    app.get("/test", (req, res) => {
        return res.sendStatus(200);
    })

    app.listen(port, () => {
        console.log(`Recording Server running on port ${port}`);
    });
})();
