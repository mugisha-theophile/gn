const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const path = require('path');

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Health Check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

// Logs for debugging
app.use((req, res, next) => {
    console.log(`Request: ${req.method} ${req.url}`);
    next();
});


// --- 1. FIXED CONNECTION STRING ---
// Vercel reads this from the Environment Variables dashboard
const MONGO_URI = process.env.MONGO_URI;

// --- 2. OPTIMIZED CONNECTION FOR VERCEL ---
// Global variable to cache the connection across invocations
let cached = global.mongoose;

if (!cached) {
    cached = global.mongoose = { conn: null, promise: null };
}

async function dbConnect() {
    if (cached.conn) {
        return cached.conn;
    }

    if (!cached.promise) {
        const opts = {
            bufferCommands: false,
        };

        cached.promise = mongoose.connect(MONGO_URI, opts).then((mongoose) => {
            console.log('✅ Connected to MongoDB');
            return mongoose;
        });
    }

    try {
        cached.conn = await cached.promise;
    } catch (e) {
        cached.promise = null;
        throw e;
    }

    return cached.conn;
}

// --- SCHEMAS ---

// 1. Property Schema
const propertySchema = new mongoose.Schema({
    title: String, description: String, price: Number, bedrooms: Number,
    bathrooms: Number, area: Number, location: {
        address: String, city: String, state: String, zipCode: String, coordinates: Object
    },
    propertyType: String, images: [String], amenities: [String],
    available: { type: Boolean, default: true },
    featured: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

// 2. Job Schema
const jobSchema = new mongoose.Schema({
    title: String, company: String, location: String, salary: String,
    type: String, description: String, image: String,
    featured: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

// 3. Pending Ad Schema (Waiting for approval)
const pendingAdSchema = new mongoose.Schema({
    advertiserName: String, advertiserPhone: String, advertiserEmail: String,
    transactionId: String, amountPaid: Number, paymentDate: Date,
    propertyData: propertySchema // Embedded Schema
});

// 4. Pending Job Schema
const pendingJobSchema = new mongoose.Schema({
    advertiserName: String, advertiserPhone: String,
    transactionId: String, amountPaid: Number, paymentDate: Date,
    jobData: jobSchema // Embedded Schema
});

// 5. Message Schema (Contact Form)
const messageSchema = new mongoose.Schema({
    name: String, email: String, phone: String, message: String,
    propertyId: String, propertyTitle: String,
    date: { type: Date, default: Date.now }
});

// 6. Job Application Schema
const jobApplicationSchema = new mongoose.Schema({
    jobId: String,
    applicant: {
        names: String, telephone: String, gender: String,
        place: String, email: String, age: String, academicLevel: String
    },
    payment: { provider: String, transactionId: String },
    status: { type: String, default: 'pending' },
    date: { type: Date, default: Date.now }
});


// 7. Direct Inquiry Schema (Contact Fee)
const directInquirySchema = new mongoose.Schema({
    name: String, email: String, phone: String, message: String,
    propertyId: String, propertyTitle: String,
    transactionId: String, provider: String,
    status: { type: String, default: 'pending' }, // pending, confirmed
    amount: Number,
    date: { type: Date, default: Date.now }
});

// 8. Blog Schema
const blogSchema = new mongoose.Schema({
    title: String,
    category: String,
    content: String,
    excerpt: String,
    image: String,
    date: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now }
});

// Create Models
const Property = mongoose.model('Property', propertySchema);
const Job = mongoose.model('Job', jobSchema);
const PendingAd = mongoose.model('PendingAd', pendingAdSchema);
const PendingJob = mongoose.model('PendingJob', pendingJobSchema);
const Message = mongoose.model('Message', messageSchema);
const JobApplication = mongoose.model('JobApplication', jobApplicationSchema);
const DirectInquiry = mongoose.model('DirectInquiry', directInquirySchema);
const Blog = mongoose.model('Blog', blogSchema);

// --- ROUTES ---

// 1. GET Data
app.get('/api/blogs', async (req, res) => {
    try {
        await dbConnect();
        const data = await Blog.find().sort({ date: -1 });
        res.json(data);
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});
app.get('/api/properties', async (req, res) => {
    try {
        await dbConnect();
        const data = await Property.find().sort({ createdAt: -1 });
        res.json(data);
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/api/jobs', async (req, res) => {
    try {
        await dbConnect();
        const data = await Job.find().sort({ createdAt: -1 });
        res.json(data);
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/api/pending-ads', async (req, res) => {
    try {
        await dbConnect();
        const data = await PendingAd.find().sort({ paymentDate: -1 });
        res.json(data);
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/api/pending-jobs', async (req, res) => {
    try {
        await dbConnect();
        const data = await PendingJob.find().sort({ paymentDate: -1 });
        res.json(data);
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/api/direct-inquiries', async (req, res) => {
    try {
        await dbConnect();
        const data = await DirectInquiry.find().sort({ date: -1 });
        res.json(data);
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/api/direct-inquiries/:id', async (req, res) => {
    try {
        await dbConnect();
        const inquiry = await DirectInquiry.findById(req.params.id);
        if (!inquiry) return res.status(404).json({ success: false, error: 'Inquiry not found' });
        res.json(inquiry);
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 2. POST Data (User Actions)

// A. Send Contact Message
app.post('/api/messages', async (req, res) => {
    try {
        await dbConnect();
        const newMessage = new Message(req.body);
        await newMessage.save();
        console.log(`📩 NEW MESSAGE from ${req.body.name}: ${req.body.message}`);
        res.json({ success: true, message: 'Message sent successfully!' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// B. Submit Job Application
app.post('/api/job-applications', async (req, res) => {
    try {
        await dbConnect();
        const newApp = new JobApplication(req.body);
        await newApp.save();
        console.log(`💼 JOB APPLICATION for "${req.body.jobTitle}" by ${req.body.applicant.names}`);
        res.json({ success: true, message: 'Application submitted!' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// C. Submit Pending Ad (User submits form)
app.post('/api/pending-ads', async (req, res) => {
    try {
        await dbConnect();
        const { _id, ...data } = req.body;

        if (data.paymentDate && typeof data.paymentDate === 'string') {
            data.paymentDate = new Date(data.paymentDate);
        }

        const newPending = new PendingAd(data);
        await newPending.save();

        console.log(`🏠 NEW PROPERTY AD SUBMITTED: ${data.propertyData.title} by ${data.advertiserName}`);
        res.json({ success: true, message: 'Ad submitted for approval' });
    } catch (e) {
        console.error("Error saving pending ad:", e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// D. Submit Pending Job
app.post('/api/pending-jobs', async (req, res) => {
    try {
        await dbConnect();
        const { _id, ...data } = req.body;

        if (data.paymentDate && typeof data.paymentDate === 'string') {
            data.paymentDate = new Date(data.paymentDate);
        }

        const newPending = new PendingJob(data);
        await newPending.save();

        console.log(`💼 NEW JOB AD SUBMITTED: ${data.jobData.title} by ${data.advertiserName}`);
        res.json({ success: true, message: 'Job submitted for approval' });
    } catch (e) {
        console.error("Error saving pending job:", e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// E. Submit Direct Inquiry (Contact Fee Request)
app.post('/api/direct-inquiries', async (req, res) => {
    try {
        await dbConnect();
        const newInquiry = new DirectInquiry(req.body);
        await newInquiry.save();
        console.log(`💰 NEW DIRECT INQUIRY (Fee Paid): ${req.body.propertyTitle} by ${req.body.name}`);
        res.json({ success: true, inquiry: newInquiry });
    } catch (e) {
        console.error("Inquiry Submission Error:", e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// 3. Admin Actions

// A. Create Property (Directly from Dashboard)
app.post('/api/properties', async (req, res) => {
    try {
        await dbConnect();
        const newProp = new Property(req.body);
        await newProp.save();
        console.log(`🏠 ADMIN CREATED: ${req.body.title}`);
        res.json({ success: true, message: 'Property created' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// B. Delete Property
app.delete('/api/properties/:id', async (req, res) => {
    try {
        await dbConnect();
        await Property.findByIdAndDelete(req.params.id);
        console.log(`🗑️ ADMIN DELETED Property ID: ${req.params.id}`);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to delete' });
    }
});

// C. Approve Ad (Move from Pending to Live)
app.post('/api/pending-ads/:id/approve', async (req, res) => {
    try {
        await dbConnect();
        const pending = await PendingAd.findById(req.params.id);
        if (pending) {
            const newPropData = pending.propertyData.toObject();
            newPropData.available = true;
            newPropData.createdAt = new Date();

            const newProp = new Property(newPropData);
            await newProp.save();

            await PendingAd.findByIdAndDelete(req.params.id);

            console.log(`✅ ADMIN APPROVED AD: ${newPropData.title}`);
            res.json({ success: true, message: 'Ad Approved' });
        } else {
            res.status(404).json({ success: false, error: 'Pending ad not found' });
        }
    } catch (error) {
        console.error("Approval Error:", error);
        res.status(500).json({ success: false, error: 'Failed to approve' });
    }
});

// D. Approve Job (Move from Pending to Live)
app.post('/api/pending-jobs/:id/approve', async (req, res) => {
    try {
        await dbConnect();
        const pending = await PendingJob.findById(req.params.id);
        if (pending) {
            const newJobData = pending.jobData.toObject();
            newJobData.createdAt = new Date();
            newJobData.featured = false;

            const newJob = new Job(newJobData);
            await newJob.save();

            await PendingJob.findByIdAndDelete(req.params.id);

            console.log(`✅ ADMIN APPROVED JOB: ${newJobData.title}`);
            res.json({ success: true, message: 'Job Approved' });
        } else {
            res.status(404).json({ success: false, error: 'Pending job not found' });
        }
    } catch (error) {
        console.error("Approval Error:", error);
        res.status(500).json({ success: false, error: 'Failed to approve' });
    }
});

// E. Confirm Direct Inquiry (Approve Payment)
app.post('/api/direct-inquiries/:id/approve', async (req, res) => {
    try {
        await dbConnect();
        const inquiry = await DirectInquiry.findById(req.params.id);
        if (inquiry) {
            inquiry.status = 'confirmed';
            await inquiry.save();
            console.log(`✅ ADMIN CONFIRMED PAYMENT for: ${inquiry.propertyTitle}`);
            res.json({ success: true, message: 'Payment Confirmed' });
        } else {
            res.status(404).json({ success: false, error: 'Inquiry not found' });
        }
    } catch (error) {
        console.error("Direct Inquiry Approval Error:", error);
        res.status(500).json({ success: false, error: 'Failed to approve payment' });
    }
});

// F. Blog Management (Admin)
app.post('/api/blogs', async (req, res) => {
    try {
        await dbConnect();
        const newBlog = new Blog(req.body);
        await newBlog.save();
        console.log(`📝 ADMIN CREATED BLOG: ${req.body.title}`);
        res.json({ success: true, message: 'Blog post created' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.put('/api/blogs/:id', async (req, res) => {
    try {
        await dbConnect();
        await Blog.findByIdAndUpdate(req.params.id, req.body);
        console.log(`📝 ADMIN UPDATED BLOG ID: ${req.params.id}`);
        res.json({ success: true, message: 'Blog post updated' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.delete('/api/blogs/:id', async (req, res) => {
    try {
        await dbConnect();
        await Blog.findByIdAndDelete(req.params.id);
        console.log(`🗑️ ADMIN DELETED BLOG ID: ${req.params.id}`);
        res.json({ success: true, message: 'Blog post deleted' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// --- 3. CRITICAL: EXPORT APP FOR VERCEL ---
// Vercel handles the server startup.
module.exports = app;

// --- 4. LOCAL DEVELOPMENT ---
if (require.main === module) {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
        console.log(`Server running locally on http://localhost:${PORT}`);
    });
}