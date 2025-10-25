const { createCanvas, loadImage } = require('canvas');

// --- Helper functions ---
function stringToBytes(str) {
    // This function converts a string to a byte array (Uint8Array).
    return Buffer.from(str, 'utf8');
}

function bytesToString(bytes) {
    // This function converts a byte array (Uint8Array) back to a string.
   return Buffer.from(bytes).toString('utf8');
}

// --- Custom, Library-Free Encryption/Decryption ---
function encryptMessage(message, password) {
    const messageBytes = stringToBytes(message);
    const passwordBytes = stringToBytes(password);
    const encryptedBytes = new Uint8Array(messageBytes.length);

    for (let i = 0; i < messageBytes.length; i++) {
        encryptedBytes[i] = messageBytes[i] ^ passwordBytes[i % passwordBytes.length];
    }
    return encryptedBytes;
}

function decryptMessage(encryptedData, password) {
    const passwordBytes = stringToBytes(password);
    const decryptedBytes = new Uint8Array(encryptedData.length);

    for (let i = 0; i < encryptedData.length; i++) {
        decryptedBytes[i] = encryptedData[i] ^ passwordBytes[i % passwordBytes.length];
    }

    return bytesToString(decryptedBytes);
}

// --- Custom Steganography Functions ---
function hideDataInImage(imageData, data) {
    const pixels = imageData.data;
    const dataArray = Array.from(data);
    const lengthBinary = dataArray.length.toString(2).padStart(32, '0'); // Hide data length in first 32 pixels
    const dataBinary = dataArray.map(byte => byte.toString(2).padStart(8, '0')).join('');
    const fullBinary = lengthBinary + dataBinary;

    if (fullBinary.length > pixels.length) {
        throw new Error('Image too small for this message.');
    }
    // Modify the Least Significant Bit (LSB) of each pixel component
    for (let i = 0; i < fullBinary.length; i++) {
        pixels[i] = (pixels[i] & 0xFE) | parseInt(fullBinary[i], 10);
    }
    return imageData;
}

function extractDataFromImage(imageData) {
    const pixels = imageData.data;
    let lengthBinary = '';
    // Extract data length from the first 32 pixels
    for (let i = 0; i < 32; i++) {
        lengthBinary += (pixels[i] & 1).toString();
    }
    const dataLength = parseInt(lengthBinary, 2);

    if (isNaN(dataLength) || dataLength <= 0 || (32 + dataLength * 8) > pixels.length) {
        throw new Error('Invalid data length or no hidden data found.');
    }

    let dataBinary = '';
    // Extract the data bits from the subsequent pixels
    for (let i = 32; i < 32 + (dataLength * 8); i++) {
        dataBinary += (pixels[i] & 1).toString();
    }

    const dataBytes = [];
    for (let i = 0; i < dataBinary.length; i += 8) {
        dataBytes.push(parseInt(dataBinary.substring(i, i + 8), 2));
    }
    return new Uint8Array(dataBytes);
}

// --- Main processing functions ---
async function createStegoImage(originalImagePath, message, password) {
    const image = await loadImage(originalImagePath);
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const encryptedData = encryptMessage(message, password); // Using custom XOR cipher
    const stegoImageData = hideDataInImage(imageData, encryptedData);

    ctx.putImageData(stegoImageData, 0, 0);
    return canvas.toBuffer('image/png');
}

async function decryptStegoImage(stegoImagePath, password) {
    const image = await loadImage(stegoImagePath);
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const extractedData = extractDataFromImage(imageData);
    const decryptedMessage = decryptMessage(extractedData, password); // Using custom XOR cipher

    return decryptedMessage;
}

module.exports = {
    createStegoImage,
    decryptStegoImage
};