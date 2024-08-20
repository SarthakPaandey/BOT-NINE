const express = require("express");
const { OpenAI } = require("openai");
const { Sequelize, DataTypes } = require("sequelize");
const dotenv = require("dotenv");
const axios = require("axios");
const nodemailer = require("nodemailer");

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static("."));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
let messages = [
  {
    role: "system",
    content: `You are a helpful hotel booking assistant. Use the following room options when asked:Ask for the following information before booking: Full Name, Email, Room ID, Number of Nights. Confirm all details before making a booking.
          then when you confirm booking give all final details to user with heading "confirm your booking" after confirming call the "bookroom" function using function calling
          
          `,
  },
];
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
    console.log("Fetching room options...");
    const response = await axios.get("https://bot9assignement.deno.dev/rooms");
    return response.data
      .map((room) => `${room.name} (ID: ${room.id}) - Rs.${room.price}/night`)
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

    console.log("Booking successful:", response.data);

    return response.data;
  } catch (error) {
    console.error("Error booking room:", error);
    throw new Error("Unable to book the room at the moment.");
  }
}

// Function to send a real confirmation email
async function sendConfirmationEmail(email, bookingDetails) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Booking Confirmation",
    text: `Your booking is confirmed!\n\nBooking Details:\n${JSON.stringify(
      bookingDetails,
      null,
      2
    )}`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("Email sent successfully");
  } catch (error) {
    console.error("Error sending email:", error);
    throw new Error("Failed to send confirmation email");
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
      limit: 10,
    });

    // Prepare conversation for OpenAI
    const conversationHistory = history
      .map((h) => `Human: ${h.message}\nAI: ${h.response}`)
      .join("\n");

    // Get room options
    const roomOptions = await getRoomOptions();
    let mes = {
      role: "user",
      content: message,
    };
    messages.push(mes);
    // Generate chatbot response
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: messages,
    });

    const botResponse = completion.choices[0].message.content;
    mes = {
      role: "assistant",
      content: botResponse,
    };
    messages.push(mes);

    // Store bot response in conversation history
    await Conversation.update(
      { response: botResponse },
      {
        where: { userId, response: "" },
      }
    );

    // Check if all booking details are provided
    if (botResponse.toLocaleLowerCase().includes("confirm your booking")) {
      const bookingDetails = botResponse.match(
        /Full Name: (.+), Email: (.+), Room ID: (\d+), Nights: (\d+)/
      );
      if (bookingDetails) {
        const [fullName, email, roomId, nights] = bookingDetails;

        try {
          const booking = await bookRoom(
            parseInt(roomId),
            fullName,
            email,
            parseInt(nights)
          );
          console.log("Booking successful:", booking);

          // Use the booking ID from the API response
          let confirmationResponse = `Great news! Your booking is confirmed. Booking ID: ${booking.bookingId}. Room: ${booking.roomName}. Total Price: $${booking.totalPrice}. A confirmation email will be sent to ${email}.`;

          try {
            await sendConfirmationEmail(email, booking);
          } catch (emailError) {
            console.error("Failed to send confirmation email:", emailError);
            // Add a note about email failure to the confirmation response
            confirmationResponse +=
              " However, we couldn't send a confirmation email. Please save this booking ID for your records.";
          }

          await Conversation.create({
            userId,
            message: "System: Booking confirmed",
            response: confirmationResponse,
          });
          return res.json({ message: confirmationResponse });
        } catch (error) {
          const errorResponse =
            "I'm sorry, but there was an error processing your booking. Please try again or contact our support team.";
          await Conversation.create({
            userId,
            message: "System: Booking error",
            response: errorResponse,
          });
          return res.json({ message: errorResponse });
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
