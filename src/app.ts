import fs from 'fs';
import cors from 'cors';
import path from 'path';
import multer from 'multer';
import express from 'express';
import session from 'express-session';
import { hash, compare } from 'bcrypt';
import { mysql_con } from './db_conn';
import { Recorder } from './lib/Recorder';

const app = express();
const port = 8080;
const recorders: Map<string, Recorder> = new Map<string, Recorder>();
const upload = multer({ dest: '../uploads', storage: multer.memoryStorage() });
// const mysql_con = createConnection({
//     host: "localhost",
//     user: "bima",
//     password: "admin123",
//     database: "meeting_rpl"
// });


class User {
    id: any = "";
    name: any = "";

    constructor(id: string, name: string) {
        this.id = id;
        this.name = name;
    }
};

declare module "express-session" {
    interface SessionData {
        user: User;
    }
};

app.use(cors({
    origin: ['http://localhost:3000', 'https://sfu.server:5000', 'https://sfu-kulon.server:5000'],
    credentials: true,
    methods: ['GET', 'POST'],
    exposedHeaders: ["set-cookie"]
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: "verypog",
    saveUninitialized: false,
    resave: false,
    cookie: {
        secure: false,
        httpOnly: true,
    }
}));
//app.use('/public', express.static(path.join(__dirname, 'public')));
//app.use('/recordings', express.static(path.join(__dirname, 'public')));

(async () => {
    // Login & Register
    app.post("/register", (req, res) => {
        const name = req.body.name;
        const email = req.body.email;
        const password = req.body.password;

        if (name != undefined || email != undefined || password != undefined) {
            hash(password, 10, function(err, hash) {
                mysql_con.query("INSERT INTO users (name, email, password) VALUES (" + mysql_con.escape(name) + ", " + mysql_con.escape(email) + ",'" + hash + "')", function(err, result) {
                    if (err) throw err;
                    return res.status(201).send({
                        'status': true,
                        'message': 'Register Berhasil'
                    });
                });
            });
        }
    });

    app.post("/login", (req, res) => {
        const email = mysql_con.escape(req.body.email);
        const password = req.body.password;

        if (email === undefined || password === undefined) {
            return res.status(401).send({
                'status': false,
                'message': "Email atau password harus di-isi",
            });
        }

        mysql_con.query(`SELECT id, name, password, email FROM users WHERE email=${email}`, function(err, result) {
            if (err) throw err;

            compare(password, result[0].password, function(err, comparison) {
                if (comparison) {
                    req.session.user = new User(result[0].id, result[0].name);;
                    console.log(req.session);
                    return res.status(201).send({
                        'status': true,
                        'message': 'Login berhasil',
                        'user': {
                            'name': result.name,
                            'email': result.email,
                        }
                    });
                } else {
                    return res.status(401).send({
                        'status': false,
                        'message': 'Email atau password salah',
                    });
                }
            });
        });
    });

    app.post('/logout', (req, res) => {
        console.log("lougout " + req.session.user);
        req.session.destroy(function(err) {
            if (err) res.status(400).send({ status: false });
            return res.send({ status: true });
        })
    });

    app.get('/me', (req, res) => {
        if (!req.session.user) {
            return res.status(401).send({
                status: false
            });
        } else {
            return res.send({
                status: true,
                user: req.session.user
            });
        }
    });

    // Recordings
    app.use("/recordings", express.static("public/uploads"));

    app.use("/my-recordings", (req, res) => {
        mysql_con.query("SELECT * FROM recordings WHERE user_id = " + req.session.user?.id, function (err, results) {
            if (err) {
                res.send(400);
            };

            res.send(results);
        });
    });

    app.post('/recording-create', async (req, res) => {
        const room_id = req.body.room_id;
        const owner_id = req.body.owner_id;
        const user_id = req.body.user_id;

        if (recorders.has(room_id)) {
            return res.status(400).send({ 'error': 'Recorder has already created' });
        }

        const newRecorder = new Recorder(room_id, owner_id, user_id);
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

        recorder.setResponse(res);
        // Response is sent inside recorder events
        await recorder.stopRecording();
        recorders.delete(room_id);
    });

    app.post("/uploadFile", upload.single('audioBlob'), (req, res) => {
        if (!req.file) {
            return res.send("File not uploaded");
        }

        const folder = path.resolve(__dirname + '/../uploads/').toString();
        const filename = folder + '/' + req.body.filename + '-audio.webm';

        try {
            fs.writeFileSync(filename, req.file.buffer);
            console.log(req.file.buffer);
            return res.sendStatus(200);
        } catch (err) {
            console.log("error writing Audio file", err);
        }
    })

    app.listen(port, () => {
        console.log(`Recording Server running on port ${port}`);
    });
})();
