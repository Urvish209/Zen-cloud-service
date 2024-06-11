const { IamTokenManager } = require('ibm-cloud-sdk-core'); // Corrected import
const AWS = require('ibm-cos-sdk');

// Set environment variables
process.env.COS_API_KEY = 'DZYAmP9nOt7XD_LH6TvnB9yODupE36TEmi-pSqJt8q68';
process.env.COS_INSTANCE_ID = 'crn:v1:bluemix:public:cloud-object-storage:global:a/96ddc3a1c79a4c92abf32d96f594bf66:7b3c40df-48f9-4fe5-998a-b0814caa8650::';
process.env.CLOUDANT_API_KEY = 'oM_nY5CZMtM72KOeNMD7GCGSJ9za3a67SOeqZgzyrpA1';
process.env.CLOUDANT_URL = 'https://5b274c0c-4c0d-435d-96a7-a43412d9273d-bluemix.cloudantnosqldb.appdomain.cloud';
process.env.APPID_CLIENT_ID = '6cb04f6d-b340-49a9-812e-32c727e24fb8';
process.env.APPID_SECRET = 'N2RhNWIzNzAtODE5Ny00MjU2LTlmZDktM2VlMmUwNDBhMjhi';
process.env.APPID_OAUTH_SERVER_URL = 'https://au-syd.appid.cloud.ibm.com/oauth/v4/f969fe3e-fad4-4c3a-a545-844447f0a709';

const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const { CloudantV1 } = require('@ibm-cloud/cloudant');
const { IamAuthenticator } = require('ibm-cloud-sdk-core');
const { AppID, WebAppStrategy } = require('ibmcloud-appid');

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Routes
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// Obtain IAM token using API key
const iamTokenManager = new IamTokenManager({
  apikey: process.env.COS_API_KEY
});


const configureCOS = async () => {
  const tokenResponse = await iamTokenManager.getToken();
  const sessionToken = tokenResponse.access_token;

  return new AWS.S3({
    endpoint: 'https://s3.us.cloud-object-storage.appdomain.cloud',
    region: 'us-geo', // Set your COS region here
    credentials: new AWS.Credentials({
      accessKeyId: '7156afa829b34a8c9ff024909fd7bde5',
      secretAccessKey: '68c559090c62f7a7498d1916aa1efbc006f0fad9cb795b99',
      sessionToken: sessionToken
    }),
    s3ForcePathStyle: true, // required for IBM COS S3 compatibility
  });
};




// Cloudant configuration
const cloudant = CloudantV1.newInstance({
  authenticator: new IamAuthenticator({ apikey: process.env.CLOUDANT_API_KEY }),
  serviceUrl: process.env.CLOUDANT_URL,
});

// App ID configuration
const appIDStrategy = new WebAppStrategy({
  clientId: process.env.APPID_CLIENT_ID,
  secret: process.env.APPID_SECRET,
  oauthServerUrl: process.env.APPID_OAUTH_SERVER_URL,
  tenantId: process.env.APPID_OAUTH_SERVER_URL.split('/oauth/v4/')[1],
  redirectUri: 'https://your-app-url.com/auth/callback' // Specify your application's callback URL here
});

// Verify token function
const verifyToken = async (token) => {
  try {
    const userInfo = await appIDStrategy.getManager().getUserInfo(token);
    return userInfo;
  } catch (error) {
    throw new Error('Invalid token');
  }
};

// File upload endpoint
const upload = multer({ dest: 'uploads/' });

app.post('/upload', upload.single('file'), async (req, res) => {
  const { originalname, path } = req.file;
  try {
    const cos = await configureCOS();
    await uploadFile(cos, 'mystorage23', originalname, path); // Replace 'your-bucket-name' with your actual bucket name
    res.status(200).send('File uploaded successfully');
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).send('File upload failed');
  }
});

// File download endpoint
app.get('/download/:filename', async (req, res) => {
  const { filename } = req.params;
  try {
    const cos = await configureCOS();
    const file = await downloadFile(cos, 'mystorage23', filename); // Replace 'your-bucket-name' with your actual bucket name
    res.status(200).send(file.Body);
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).send('File download failed');
  }
});

// User authentication endpoint
app.post('/login', async (req, res) => {
  const { token } = req.body;
  try {
    const userInfo = await verifyToken(token);
    res.status(200).send(userInfo);
  } catch (error) {
    console.error('Error verifying token:', error);
    res.status(401).send('Authentication failed');
  }
});

// Cloud Object Storage - Upload file function
const uploadFile = async (cos, bucketName, itemName, filePath) => {
  try {
    const params = {
      Bucket: bucketName,
      Key: itemName,
      Body: fs.createReadStream(filePath),
    };
    const data = await cos.putObject(params).promise();
    return data;
  } catch (error) {
    throw error;
  }
};

// Cloud Object Storage - Download file function
const downloadFile = async (cos, bucketName, itemName) => {
  try {
    const params = {
      Bucket: bucketName,
      Key: itemName,
    };
    const data = await cos.getObject(params).promise();
    return data;
  } catch (error) {
    throw error;
  }
};

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
