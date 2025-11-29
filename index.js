import express from 'express';
import { MongoClient, ServerApiVersion, ObjectId } from 'mongodb';
import cors from 'cors';
import dotenv from 'dotenv'; // Import the whole module
import Stripe from 'stripe'; // Conventionally use a capital 'S' for classes 
dotenv.config(); // Now call the config function

const stripe = Stripe(process.env.STRIVE);
const app = express();


import admin from "firebase-admin";
import serviceAccount from "./zap-shif-firebase-adminsdk.json" with { type: "json" };

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

import crypto from "crypto"; // Keep this one
import { count } from 'console';

// Your existing utility function:
export function generateTrackingId() {
    const prefix = "PRCL"; // your brand prefix
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD
    const random = crypto.randomBytes(3).toString("hex").toUpperCase(); // 6-char random hex
    return `${prefix}-${date}-${random}`;
}
// meddlewere

const port = process.env.PORT || 3000
app.use(express.json())
app.use(cors({
    origin: ['http://localhost:5173'] // your frontend
}));


const varifyFBToken = async (req, res, next) => {

    const authorization = req.headers.authorization
    const token = authorization.split(' ')[1]

    console.log(token)
    if (!token) {

        return res.status(401).send({ message: 'unauthorized access' })
    }

    try {
        const decoded = await admin.auth().verifyIdToken(token)

        req.decoded_email = decoded.email


        next()

    } catch (error) {
        console.log(error)
        return res.status(401).send({ message: 'unauthorized access' })
    }

}


const uri = process.env.DB_URI;


const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});



async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        const db = client.db('zap_shift_db')
        const usercollection = db.collection('users')
        const parcelscollection = db.collection('parcels')
        const paymentcollection = db.collection('payment')
        const ridercollection = db.collection('riders')
        const trackingcollection = db.collection('tracking')


        // meddwiere
        //  must be use after varifyFBToken 
        const varifyAdmin = async (req, res, next) => {

            const email = req.decoded_email
            const query = { email }
            const user = await usercollection.findOne(query)

            if (!user || user.role !== 'admin') {

                return res.status(403).send({ message: 'forbidden access' })
            }

            next()
        }
        const varifyrider = async (req, res, next) => {

            const email = req.decoded_email
            const query = { email }
            const user = await usercollection.findOne(query)

            if (!user || user.role !== 'rider') {

                return res.status(403).send({ message: 'forbidden access' })
            }

            next()
        }
     
        
        const logTracking = async(trackingId, status) => {

            const log = {
                trackingId,
                status,
                details: status.split('-').join(' '),
                createdAt: new Date()
            }

            const result = await trackingcollection.insertOne(log)
            
            return result
        }

        //  user related api




        app.get('/users', varifyFBToken, async (req, res) => {
            const search = req.query.search
            const query = {}

            if (search) {
                query.displayName = { $regex: search, $options: 'i' }

                query.$or = [
                    { displayName: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } }
                ]
            }
            const result = await usercollection.find(query).sort({ createdAt: -1 }).limit(4).toArray()
            res.send(result)
        })


        app.get('/users/:email/role', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };

            console.log("Looking for:", query);

            const user = await usercollection.findOne(query);
            console.log("Found:", user);

            res.send({ role: user?.role || "user" });
        });

        app.post('/users', async (req, res) => {
            console.log(req.body)
            const user = req.body
            user.role = 'user'
            user.createdAt = new Date()
            const email = user.email

            const userExist = await usercollection.findOne({ email })

            if (userExist) {
                console.log('you have a user ')
                return res.send({ message: 'user Exist' })
            }

            const result = await usercollection.insertOne(user)

            res.send(result)
        })

        app.patch('/users/:id/role', varifyFBToken, varifyAdmin, async (req, res) => {
            const id = req.params.id
            const roleinfo = req.body
            const query = { _id: new ObjectId(id) }
            const updateedDoc = {
                $set: {
                    role: roleinfo.role
                }
            }

            const result = await usercollection.updateOne(query, updateedDoc)
            res.send(result)
        })
        //  user related api

        app.get('/parcels', async (req, res) => {

            const qurey = {}

            const DeliveryStatus = req.query.DeliveryStatus
            const email = req.query.email;

            if (email) {
                qurey.senderemail = email;
            }

            if (DeliveryStatus) {
                qurey.DeliveryStatus = DeliveryStatus
            }

            const options = { sort: { createdAt: -1 } }

            const cursor = parcelscollection.find(qurey, options)
            const result = await cursor.toArray()
            res.send(result)
        })

        app.get('/parcels/rider', async (req, res) => {

            const   DeliveryStatus  = req.query.DeliveryStatus

            const riderEmail = req.query.riderEmail
              
            const query = {}

            if (riderEmail) {
                query.riderEmail = riderEmail
            }

            if (DeliveryStatus !== 'parcel_delived' ) {
                query.DeliveryStatus = { $nin: ['parcel_delived'] }
            }
            else {
                query.DeliveryStatus= DeliveryStatus
            }
            const result = await parcelscollection.find(query).toArray()
            

            res.send(result)

        })

        app.get('/parcels/:id', async (req, res) => {

            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await parcelscollection.findOne(query)
            res.send(result)
        })
        app.post('/parcels', async (req, res) => {

            const data = req.body

            const trackingId = generateTrackingId()
            data.createdAt = new Date()
           data.trackingId = trackingId

               logTracking(trackingId, 'parcel-created')
            const result = await parcelscollection.insertOne(data)

            res.send(result)
        })

        app.get('/parcels/DeliveryStatus/status', async (req, res) => {

            const piepline = [
                {
                    $group: {
                        _id: '$DeliveryStatus',
                        count: {$sum: 1}
                    }
                },
                {
                    $project: {
                        status: '$_id',
                        count: 1
                    }
                }
            ]

            const result = await parcelscollection.aggregate(piepline).toArray()

            res.send(result)
        })

      
        app.patch('/parcels/:id/status', async (req, res) => {
         
            const { DeliveryStatus, riderId, trackingId } = req.body 
            const query = { _id: new ObjectId(req.params.id) }
            
            console.log('this tracking id ',trackingId)
            const updateDoc = {
                $set: {
                    DeliveryStatus: DeliveryStatus
                }
            }

            if (DeliveryStatus === "parcel_delived") {
                 

                const riderQurey = { _id: new ObjectId(riderId) }
                const riderupdateddoc = {
                    $set: {
                        workStatus: 'available'
                    }
                }
            
                await parcelscollection.updateOne(riderQurey, riderupdateddoc)

                

            }
   
            const result = await parcelscollection.updateOne(query, updateDoc)



            logTracking(trackingId, DeliveryStatus)

            res.send(result)
        })

        app.delete('/parcels/:id', async (req, res) => {

            const id = req.params.id
            const query = { _id: new ObjectId(id) }
            const result = await parcelscollection.deleteOne(query)
            res.send(result)

        })


        app.patch('/parcels/:id', async (req, res) => {

            const { riderId, Name, Email, trackingId } = req.body
            const id = req.params.id
            const query = { _id: new ObjectId(id) }

            const updateedDoc = {
                $set: {
                    DeliveryStatus: 'driver-assigned',
                    riderId: riderId,
                    name: Name,
                    email: Email,
                }
            }

            const result = await parcelscollection.updateOne(query, updateedDoc)

            const riderQurey = { _id: new ObjectId(riderId)}
            const riderupdateddoc = {
                $set: {
                    workStatus: 'in-delivery'
                }
            }

            const riderresult = await ridercollection.updateOne(riderQurey, riderupdateddoc)

            console.log('this is tracking ',trackingId) 
            logTracking(trackingId, 'driver-assigned')

            res.send({riderresult, result})

        })

        // payment releted api

        app.post('/payment-checkout-session', async (req, res) => {

            const paymentdata = req.body
            const amount = parseInt(paymentdata.cost) * 100

            const session = await stripe.checkout.sessions.create({
                line_items: [
                    {
                        // Provide the exact Price ID (for example, price_1234) of the product you want to sell
                        price_data: {
                            currency: 'USD',
                            unit_amount: amount,
                            product_data: {
                                name: paymentdata.parcelName
                            }
                        },
                        quantity: 1,
                    },
                ],
                mode: 'payment',
                metadata: {
                    parcelId: paymentdata.id,
                    parcelName: paymentdata.parcelName,
                    trackingId: paymentdata.trackingId
                },
                customer_email: paymentdata.senderemail,
                success_url: `${process.env.DOMAIN}/dashboard/payment/success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${process.env.DOMAIN}/dashboard/payment/cancelled`,
            });

            res.send({ url: session.url })
        })

        // app.post('/create-checkout-session', async (req, res) => {
        //     const paymentdata = req.body
        //     const amount = parseInt(paymentdata.cost) * 100
        //     const session = await stripe.checkout.sessions.create({
        //         line_items: [
        //             {
        //                 // Provide the exact Price ID (for example, price_1234) of the product you want to sell
        //                 price_data: {
        //                     currency: 'USD',
        //                     unit_amount: amount,
        //                     product_data: {
        //                         name: paymentdata.parcelName
        //                     }
        //                 },
        //                 quantity: 1,
        //             },
        //         ],
        //         customer_email: paymentdata.senderemail,
        //         metadata: {
        //             parcelId: paymentdata.id
        //         },
        //         mode: 'payment',
        //         success_url: `${process.env.DOMAIN}/dashboard/payment/success`,
        //         cancel_url: `${process.env.DOMAIN}/dashboard/payment/cancelled`,


        //     })

        //     console.log(session)
        //     res.send({ url: session.url })
        // })

        app.patch('/payment-success', async (req, res) => {

            const sessionid = req.query.session_id
            const session = await stripe.checkout.sessions.retrieve(sessionid)
            console.log('sesstion retrieve', session)

            const transactionId = session.payment_intent

            const query = { transactionId: transactionId }

            const paymentExist = await paymentcollection.findOne(query)

            if (paymentExist) {

                return res.send({ message: 'Already Exist', transactionId, trakingId: paymentExist.trakingId })
            }





            const trakingId = session.metadata.trackingId
            if (session.payment_status === 'paid') {
                const id = session.metadata.parcelId
                const query = { _id: new ObjectId(id) }
                const update = {
                    $set: {
                        payment_status: 'paid',
                        DeliveryStatus: 'pending-pickup',
                        trakingId: trakingId,
                    }
                }

                const result = await parcelscollection.updateOne(query, update)
                const payment = {
                    customeremail: session.customer_email,
                    currency: session.currency,
                    amount: session.amount_total,
                    parcelId: session.parcelId,
                    parcelName: session.parcelName,
                    payment_status: session.payment_status,
                    transactionId: session.payment_intent,
                    paidAt: new Date(),
                    trakingId: trakingId
                }

                if (session.payment_status === 'paid') {

                    const resultpayment = await paymentcollection.insertOne(payment)
                         
                    logTracking(trakingId, 'pending-pickup')
                    res.send({
                        success: true,
                        trakingId: trakingId,
                        modifyparcel: result,
                        transactionId: session.payment_intent,
                         paymentinfo: resultpayment
                    })
                }
            return   res.send(result)
            }
            return res.send({ message: true })
        })
  

     

        // riders rileted api

        app.get('/riders', async (req, res) => {
            const query = {}

            const { status, district, workStatus } = req.query
        console.log('status checking.......', status)
            if (status) {
                query.status = status
            }
            // if (district) {
            //     query.district = district
            // }
            if (workStatus) {
                query.workStatus = workStatus
            }
            const result = await ridercollection.find(query).toArray()
            res.send(result)
        })


        app.post('/riders', async (req, res) => {
            const rider = req.body
            rider.status = 'pending'
            rider.createdAt = new Date()

            const result = await ridercollection.insertOne(rider)

            res.send(result)

        })

        app.get('/riders/delivery-par-day', async (req, res) => {
            
            const email = req.query.email 

            const piepline = [
                {
                    
                        $match: {
                            email: email
                        }
                    
                },
                {
                    $lookup: {
                        from: "tracking",
                        localField: "trackingId",
                        foreignField: "trackingId",
                        as: "parcel-tracking"
                    }
                },
                {
                    $unwind: "$parcel-tracking"
                }, 
                {
                    $match: {
                        "parcel-tracking.status": "pending-pickup"
                    }
                }, 
                {
                    // convert timestamp to YYYY-MM-DD string
                    $addFields: {
                        deliveryDay: {
                            $dateToString: {
                                format: "%Y-%m-%d",
                                date: "$parcel-tracking.createdAt"
                            }
                        }
                    }
                },
                {
                    // group by date
                    $group: {
                        _id: "$pandingDay",
                        deliveredCount: { $sum: 1 }
                    }
                }
            ]

            const result = await parcelscollection.aggregate(piepline).toArray()

            res.send(result)
        })

       

        // app.patch('/riders/:id', async (req, res) => {
        //     try {
        //         const { status, email } = req.body;
        //         const id = req.params?.id;

        //         if (!id) return res.status(400).send({ error: 'Invalid rider ID' });

        //         const query = { _id: new ObjectId(id) };

        //         const updateDoc = {
        //             $set: {
        //                 status,
        //                 workStatus: status === 'approved' ? 'available' : 'pending'
        //             }
        //         };

        //         // If status approved → update the user role first
        //         if (status === 'approved' && email) {
        //             const userQuery = { email };
        //             const userUpdate = { $set: { role: 'rider' } };

        //             await usercollection.updateOne(userQuery, userUpdate);
        //         }

        //         // Update rider data
        //         const result = await ridercollection.updateOne(query, updateDoc);

        //         return res.send(result);

        //     } catch (error) {
        //         console.error(error);
        //         res.status(500).send({ error: 'Internal Server Error' });
        //     }
        // });
        app.patch('/riders/:id', async (req, res) => {
            try {
                const { status, email } = req.body;
                const id = req.params?.id;

                if (!id) {
                    return res.status(400).send({ error: 'Invalid rider ID' });
                }

                const query = { _id: new ObjectId(id) };

                const updateDoc = {
                    $set: {
                        status,
                        workStatus: status === 'approved' ? 'available' : 'pending'
                    }
                };

                let userUpdateResult = null;

                // If approved → update user role in users collection
                if (status === 'approved' && email) {
                    userUpdateResult = await usercollection.updateOne(
                        { email },
                        { $set: { role: 'rider' } }
                    );
                }

                // Update the rider collection
                const riderUpdateResult = await ridercollection.updateOne(query, updateDoc);

                // Send one response with both results
                res.send({
                    message: "Rider updated successfully",
                    riderUpdate: riderUpdateResult,
                    userUpdate: userUpdateResult
                });

            } catch (error) {
                console.error(error);
                res.status(500).send({ error: 'Internal Server Error' });
            }
        });


        // payment relatedapi

        app.get('/payments', varifyFBToken, async (req, res) => {

            const email = req.query.email
            const query = {}

            if (email) {
                query.customeremail = email

                if (email !== req.decoded_email) {

                    return res.status(403).send({ message: 'forbidden access ' })
                }
            }

            const result = await paymentcollection.find(query).toArray()
            res.send(result)
        })

        app.get('/tracking', async (req, res) => {
          



            try {
                const result = await trackingcollection.find().toArray();
                console.log('result seeing ', result)
                res.send(result); // sends an array of matching documents
            } catch (err) {
                console.log('error is comming ', err);
                res.status(500).send({ error: 'Failed to fetch tracking logs' });
            }
        });


        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);






app.get('/', (req, res) => {
    res.send('zap-shift-running')
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})