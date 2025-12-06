# Video Meeting System

A web-based video conferencing application designed for conducting entrance and exit interviews. The system supports role-based access (Admin/Student), real-time video calls via WebRTC, session recording with local storage, and automated transcription.

## Features

### Core Functionality
-   **Real-time Video & Audio**: High-quality video calls using WebRTC.
-   **Role-Based Access**:
    -   **Admins**: Can create meetings, invite students, record sessions, and manage recordings.
    -   **Students**: Can join meetings via room code or invitation and participate in interviews.
-   **Meeting Management**:
    -   Create instant meetings with unique room codes.
    -   Secure joining validation (room code expiration, active status).
    -   Lobby system for pre-meeting setup (name input, device selection).

### Recording & Archives
-   **Session Recording**: Admins can record meetings (audio-only currently optimized) which are saved to the server.
-   **Automated Transcription**: Integrated Python-based transcription service using speech recognition.
-   **Archive System**: Recordings can be archived and restored.
-   **Auto-Deletion**: Automated cleanup of archived recordings older than 30 days.

### User Experience
-   **Live Subtitles**: Real-time speech-to-text subtitles during meetings.
-   **Device Management**: Select preferred microphone and camera before joining.
-   **Responsive Design**: Modern, glassmorphism-inspired UI built with vanilla CSS.

## Tech Stack

-   **Frontend**: HTML5, CSS3, JavaScript (Vanilla), Socket.IO Client
-   **Backend**: Node.js, Express.js
-   **Database**: SQLite3 (for users, meetings, and recordings)
-   **Real-time Communication**: Socket.IO, WebRTC
-   **Media Processing**: FFmpeg (for audio conversion), Python (for transcription)
-   **Security**: CSRF protection, BCrypt password hashing, Secure Sessions

## Installation

1.  **Prerequisites**:
    -   Node.js (v14+ recommended)
    -   Python (for transcription script)
    -   FFmpeg (included in `ffmpeg-2025-11-27...` folder, but system-wide install recommended for production)

2.  **Install Dependencies**:
    ```bash
    npm install
    ```

3.  **Database Setup**:
    The system uses SQLite. The database files (`database.sqlite`, `users.db`, `sessions.db`) will be automatically created/initialized on the first run if they don't exist.

4.  **Admin Account Creation**:
    Run the admin creation script to set up the initial admin account:
    ```bash
    node create-admin.js
    ```

## Usage

1.  **Start the Server**:
    ```bash
    npm start
    ```
    The server will run on `https://localhost:3000` (and your local network IP).

2.  **Accessing the Application**:
    -   Open your browser and navigate to `https://localhost:3000`.
    -   Accept the self-signed certificate warning (for development/local use).

3.  **Admin Workflow**:
    -   Login with admin credentials.
    -   Click "New Meeting" to generate a room code.
    -   Share the code or use the "Invite Student" feature.
    -   Join the room, record the interview, and save it.
    -   View/Manage recordings in the Dashboard.

4.  **Student Workflow**:
    -   Login with student credentials (register if needed).
    -   Enter the Room Code provided by the admin.
    -   Join the meeting.

## Project Structure

-   `server.js`: Main application entry point, API routes, and Socket.IO logic.
-   `public/`: Static assets (HTML, CSS, JS).
    -   `js/main.js`: Core frontend logic for meetings, WebRTC, and UI interactions.
    -   `css/style.css`: Global styles.
    -   `uploads/`: Directory for storing recording files and transcripts.
-   `transcribe.py`: Python script for generating transcripts from audio files.
-   `create-admin.js`: Utility script to seed admin users.

## License

ISC
