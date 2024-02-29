const admin = require("firebase-admin")
const AWS = require('aws-sdk')
const fs = require('fs')
const s3 = new AWS.S3({
  apiVersion: '2006-03-01', 
  region: process.env.REGION
});

const objParams = {
  Bucket: process.env.BUCKET_NAME,
  Key: process.env.BUCKET_KEY
}

function downloadFromS3() {
  return new Promise((resolve, reject) => {
    s3.getObject(objParams, (err, data) => {
      if (err) {
        console.log('Err: ', err)
        reject(err)
      }
    
      fs.writeFileSync('/tmp/firebase-config.json', data.Body)
      resolve(true)
    })
  })
}

async function initEnv() {
  try {
    const downloadFCM = await downloadFromS3()

    if (downloadFCM) {
      const serviceAccount = require("/tmp/firebase-config.json");
      
      // Initialize App
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: `${process.env.DB_URL}`,
      });
    }
  } catch (err) {
    console.error(err)
  }
}

async function sendBatchNotification(messages) {
    try {
      const resp = await admin.messaging().sendAll(messages)

      if (resp.failureCount > 0) {
        console.log(`Failure to send: ${resp.failureCount} notification`)
      }
      
      if (resp.successCount > 0) {
        return true
      } else {
        return false
      }
    } catch (error) {
      console.log('Err: ', error)
      return false
    }
}

exports.handler = async function(event, context) {
    try {
        await initEnv();
        const promises = event.Records.map(async (record) => {
            const { body } = record;
            
            const payload = JSON.parse(body)
            const {
              tokens,
              title,
              message,
              screen
            } = payload
            
            const messages = tokens.map((token) => {
              return {
                token: token,
                notification: {
                  body: message,
                  title: title,
                },
                data: {
                  screen: screen,
                },
                android: {
                  priority: "high"
                }
              };
            });
            
            return new Promise(async (resolve, reject) => {
                const resp = await sendBatchNotification(messages)
                if (resp) {
                    resolve({
                        success: true
                    })
                } else {
                    reject({
                        success: false
                    })
                }
            })
        });

        await Promise.all(promises).then((response)  => {
            console.log('Success: ', response)
        }).catch((error) => {
            console.log('Error: ', error)
        });
    } catch (err) {
        return {
            success: false
        }
    }
}