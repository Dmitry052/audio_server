import { AudioServer } from "./server/AudioServer";

// Application entry point — instantiates and starts the audio processing server.
const server = new AudioServer();
server.start();
