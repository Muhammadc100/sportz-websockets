import express from 'express';

const app = express();
const PORT = 8000;

// middleware to parse JSON bodies
app.use(express.json());

// root GET route
app.get('/', (req, res) => {
  res.send('Welcome to the Express server!');
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});