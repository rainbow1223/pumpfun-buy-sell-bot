require('dotenv').config(); // Load environment variables
const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true, // Use the new URL parser (optional, but recommended)
    useUnifiedTopology: true, // Use the new server discovery and monitoring engine
})
    .then(() => {
        console.log('✅ MongoDB connected successfully');
    })
    .catch((err) => {
        console.error('❌ MongoDB connection error:', err.message);
        process.exit(1); // Exit the process with failure if the DB connection fails
    });

// Export the mongoose connection for reuse in other files (optional)
module.exports = mongoose;
