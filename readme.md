# Hotel Booking Chatbot API

This project implements a RESTful API using Express.js for a hotel booking chatbot. It uses OpenAI's API for natural language processing and maintains conversation history using SQLite and Sequelize.

## Setup Instructions

1. Clone the repository:
   git clone <repository-url>
   cd hotel-booking-chatbot
2. Install dependencies:
   npm install
3. Start the server:
   node app.js
4. Create a `.env` file in the project root and add your OpenAI API key:
   OPENAI_API_KEY=your_openai_api_key_here

5. Start the server:
   node app.js
   The server will start running on `http://localhost:3000`.

## API Endpoints

### POST /chat

Handle user messages and return chatbot responses.

Request body:

```json
{
  "message": "I want to book a room",
  "userId": "user123"
}
```

{
"message": "Certainly! I'd be happy to help you book a room. Here are our available room options:\n\nStandard Room - $100/night\nDeluxe Room - $150/night\nSuite - $250/night\n\nWhich type of room would you like to book?"
}
Testing the Chatbot
You can use cURL or Postman to test the chatbot API. Here's an example cURL command:
bash
curl -X POST http://localhost:3000/chat \
-H "Content-Type: application/json" \
-d '{"message": "I want to book a room", "userId": "user123"}'
Error Handling
The API implements basic error handling for invalid user inputs or API failures. If an error occurs, the API will return a 500 status code with an error message.
