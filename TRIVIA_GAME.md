# STEM Trivia Game - Jackbox-Style Multiplayer Educational Trivia

A real-time multiplayer STEM-focused trivia game for the Basin Weather website, inspired by Jackbox Games format.

## Features

### Core Gameplay
- **Jackbox-style gameplay**: Host displays on main screen, players use mobile devices as controllers
- **Room-based system**: 6-character room codes for easy joining
- **Real-time multiplayer**: Up to 8 players per game
- **Live scoring**: Points awarded based on correctness and speed
- **STEM categories**: Science & Nature, Computer Science, Mathematics, and Science: Gadgets

### Technical Features
- **WebSocket communication**: Real-time game state synchronization using Socket.IO
- **OpenTDB API integration**: 4,700+ verified trivia questions
- **Question caching**: Prevents duplicate questions and improves performance
- **Rate limiting**: Respects API limits with 5-second intervals
- **Mobile-optimized**: Responsive design for phone controllers

### Game Settings
- **Question count**: 5, 10, 15, or 20 questions per game
- **Difficulty levels**: Easy, Medium, Hard
- **STEM Categories**: Science & Nature, Computer Science, Mathematics, Science: Gadgets
- **Timer**: 15 seconds per question

## How to Play

### For Hosts
1. Visit `/trivia/host` on your main display (TV/computer)
2. A room code will be generated automatically
3. Wait for players to join using the room code
4. Configure game settings (optional)
5. Start the game when ready

### For Players
1. Visit `/trivia/player` on your mobile device
2. Enter the 6-character room code
3. Enter your name (2-20 characters)
4. Wait for the host to start the game
5. Answer questions on your phone while watching the main screen

## Scoring System
- **Base points**: 1000 points for correct answers
- **Time bonus**: Additional points for faster responses
- **No penalty**: Incorrect answers don't subtract points
- **Real-time leaderboard**: See rankings after each question

## Technical Architecture

### Backend Components
- **TriviaGameService**: Main game logic and room management
- **Socket.IO server**: Real-time communication
- **OpenTDB API client**: Question fetching with caching
- **Room management**: In-memory game state storage

### Frontend Components
- **Host Interface** (`/trivia/host`): Main screen display
- **Player Controller** (`/trivia/player`): Mobile interface
- **Landing Page** (`/trivia`): Game selection and instructions

### API Integration
- **Question Source**: Open Trivia Database (opentdb.com)
- **Session tokens**: Prevents duplicate questions
- **Caching**: 1-hour cache for frequently requested question sets
- **Error handling**: Graceful fallbacks for API issues

## File Structure
```
server/
├── triviaGameService.js       # Main game logic
└── server.js                  # Server integration

views/
├── trivia.html               # Landing page
├── trivia-host.html          # Host interface
└── trivia-player.html        # Player controller

public/
├── css/trivia.css           # Game styling
└── js/
    ├── trivia-host.js       # Host functionality
    └── trivia-player.js     # Player functionality
```

## Configuration

### Environment Variables
No additional environment variables required - the game uses free APIs.

### Game Settings (Configurable)
- Maximum players per room: 8
- Question time limit: 15 seconds
- Results display time: 5 seconds
- Room code length: 6 characters

## Development Notes

### Known Limitations
- **In-memory storage**: Game state is lost on server restart
- **No persistence**: No game history or player statistics
- **Rate limits**: OpenTDB API has 5-second minimum between requests
- **Browser compatibility**: Requires modern browsers with WebSocket support

### Future Enhancements
- Database persistence for game history
- Custom question sets
- Team-based gameplay
- Audio/visual effects
- Player avatars
- Tournament brackets

## Testing

### Manual Testing
1. Start development server: `npm run dev`
2. Open `/trivia/host` in one browser tab
3. Open `/trivia/player` in another tab/device
4. Test room creation and joining
5. Verify question display and answering
6. Check scoring and final results

### API Testing
The game automatically handles API rate limiting and caching. Questions are fetched in real-time when games start.

## Dependencies

### New Dependencies Added
- `socket.io`: Real-time communication
- `node-cache`: Question caching

### Existing Dependencies Used
- `node-fetch`: API requests
- `express`: Web server
- `dotenv`: Configuration

## Integration

The trivia game is fully integrated into the existing Basin Weather website:
- Added to sidebar navigation
- Uses existing CSS framework
- Follows site design patterns
- No conflicts with existing functionality

## Support

For issues or questions about the trivia game:
- Check browser console for errors
- Verify network connectivity
- Ensure JavaScript is enabled
- Try refreshing the page if connection issues occur