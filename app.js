const express = require("express");
const { OpenAI } = require("openai");
const { Sequelize, DataTypes } = require("sequelize");
const dotenv = require("dotenv");
const axios = require("axios");

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static("."));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Set up SQLite database
const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: "./database.sqlite",
});

// Define Conversation model
const Conversation = sequelize.define("Conversation", {
  userId: DataTypes.STRING,
  message: DataTypes.TEXT,
  response: DataTypes.TEXT,
});

// Sync database with error handling
sequelize.sync().catch((error) => {
  console.error("Failed to sync database:", error);
});

// Function to get room options from the API
async function getRoomOptions() {
  try {
    const response = await axios.get("https://bot9assignement.deno.dev/rooms");
    return response.data
      .map((room) => `${room.name} - $${room.price}/night`)
      .join("\n");
  } catch (error) {
    console.error("Error fetching room options:", error);
    return "Unable to fetch room options at the moment.";
  }
}

// Function to book a room using the API
async function bookRoom(roomId, fullName, email, nights) {
  try {
    const response = await axios.post("https://bot9assignement.deno.dev/book", {
      roomId,
      fullName,
      email,
      nights,
    });
    return response.data;
  } catch (error) {
    console.error("Error booking room:", error);
    throw new Error("Unable to book the room at the moment.");
  }
}

// Main chatbot endpoint
app.post("/chat", async (req, res) => {
  const { message, userId } = req.body;

  try {
    // Store user message in conversation history
    await Conversation.create({ userId, message, response: "" });

    // Get conversation history
    const history = await Conversation.findAll({
      where: { userId },
      order: [["createdAt", "ASC"]],
      limit: 5,
    });

    // Prepare conversation for OpenAI
    const conversationHistory = history
      .map((h) => `Human: ${h.message}\nAI: ${h.response}`)
      .join("\n");

    // Get room options
    const roomOptions = await getRoomOptions();

    // Generate chatbot response
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful hotel booking assistant. Use the following room options when asked:\n" +
            roomOptions,
        },
        {
          role: "user",
          content: conversationHistory + `\nHuman: ${message}\nAI:`,
        },
      ],
    });

    const botResponse = completion.choices[0].message.content;

    // Store bot response in conversation history
    await Conversation.update(
      { response: botResponse },
      {
        where: { userId, response: "" },
      }
    );

    // Check if booking confirmation is needed
    if (botResponse.includes("booking confirmation")) {
      const bookingDetails = botResponse.match(
        /booking confirmation for (\w+) Room, (\d+) nights, ([\w\s]+), ([\w@.]+)/
      );
      if (bookingDetails) {
        const [, roomName, nights, fullName, email] = bookingDetails;
        // Fetch room options to get the correct roomId
        const rooms = await axios.get("https://bot9assignement.deno.dev/rooms");
        const room = rooms.data.find((r) => r.name === roomName);
        if (room) {
          const booking = await bookRoom(
            room.id,
            fullName,
            email,
            parseInt(nights)
          );
          return res.json({ message: botResponse, booking });
        }
      }
    }

    res.json({ message: botResponse });
  } catch (error) {
    console.error("Error:", error);
    res
      .status(500)
      .json({ error: "An error occurred while processing your request." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
