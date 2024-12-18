const express = require('express');
const Router = express.Router();
const cloudinary = require('cloudinary').v2;
const Employee = require('../models/Employee');
const Category = require('../models/Category');
const bcrypt = require('bcrypt')
const EmployeeAttendance = require('../models/Attendance');

const mongoose = require('mongoose');
const cron = require("node-cron");
const jwt = require('jsonwebtoken');
const verifyToken = require('../middleware/Auth');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
require('dotenv').config();


cloudinary.config({

  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET

});

// Get all categories with their subcategories
Router.get("/categories", async (req, res) => {
  try {
    const { page = 1, limit,categoryId } = req.query;
    if (categoryId) {
      // Fetch specific category by ID
      const category = await Category.findById(categoryId);
      if (!category) {
        return res.status(404).json({ error: "Category not found" });
      }
      return res.status(200).json({ category });
    }
    const skip = (page - 1) * limit;

    const categories = await Category.find().skip(skip).limit(Number(limit));
    const totalRecords = await Category.countDocuments();


    res.status(200).json({
      categories, // Ensure this is always an array
      totalRecords,
      totalPages: Math.ceil(totalRecords / limit),
    });

  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ error: "Failed to fetch categories" });
  }

});

Router.put("/categories/:categoryId/:subCategoryId", async (req, res) => {
  const { categoryId, subCategoryId } = req.params;
  const { assignto } = req.body;

  try {
    // Find the category by ID
    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }

    // Find the subcategory within the category
    const subCategory = category.subCategories.id(subCategoryId);
    if (!subCategory) {
      return res.status(404).json({ error: "Subcategory not found" });
    }

    // Replace the entire assignTo array
    if (assignto && Array.isArray(assignto)) {
      subCategory.assignto = assignto; // Completely overwrite the array
    } else {
      return res.status(400).json({ error: "Invalid assignTo format" });
    }

    // Save changes
    await category.save();

    res.status(200).json({ message: "AssignTo updated successfully", category });
  } catch (error) {
    console.error("Error updating assignTo:", error);
    res.status(500).json({ error: "Failed to update assignTo" });
  }
});


Router.patch("/categories/:categoryId/:subCategoryId", async (req, res) => {
  const { categoryId, subCategoryId } = req.params;
  const { subCategoryName, status, assignto } = req.body;

  try {
    // Find the category by ID
    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }

    // Find the subcategory within the category
    const subCategory = category.subCategories.id(subCategoryId);
    if (!subCategory) {
      return res.status(404).json({ error: "Subcategory not found" });
    }

    // Update status
    if (typeof status === "boolean") {
      subCategory.status = status;
    }

    // Update subcategory name if provided
    if (subCategoryName) {
      subCategory.subCategoryName = subCategoryName;
    }

    // Append to assignTo if provided
    if (assignto && Array.isArray(assignto)) {
      assignto.forEach((newAssign) => {
        if (
          !subCategory.assignto.some(
            (existingAssign) => existingAssign.employeeId === newAssign.employeeId
          )
        ) {
          subCategory.assignto.push(newAssign);
        }
      });
    }

    // Save changes
    await category.save();

    res.status(200).json({ message: "Subcategory updated successfully", category });
  } catch (error) {
    console.error("Error updating subcategory:", error);
    res.status(500).json({ error: "Failed to update subcategory" });
  }
});




Router.patch("/categories/:categoryId", async (req, res) => {
  const { categoryId } = req.params;
  const { category_name, subCategoryName, assignto, status } = req.body;

  try {
    // Fetch the category by ID
    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }

    // Update category-level name if provided
    if (category_name) {
      category.category_name = category_name;
    }

    // Update category-level status if provided
    if (typeof status === "boolean") {
      category.status = status;
    }

    // Initialize subCategories if not already present
    if (!category.subCategories) {
      category.subCategories = [];
    }

    // If `subCategoryName` is provided, process the addition or update
    if (subCategoryName) {
      // Check if the sub-category already exists
      const duplicate = category.subCategories.some(
        (subCat) => subCat.subCategoryName === subCategoryName
      );

      if (duplicate) {
        return res.status(400).json({ error: "Sub-category already exists" });
      }

      // Add new sub-category with optional assignto field
      category.subCategories.push({
        subCategoryName,
        assignto: assignto || [], // Default to an empty array if `assignto` is not provided
      });
    }

    // Save the changes
    await category.save();

    res.status(200).json({
      message: "Category updated successfully",
      category,
    });
  } catch (error) {
    console.error("Error updating category:", error);
    res.status(500).json({ error: "Failed to update category" });
  }
});





// Add a new category
Router.post('/categories', async (req, res) => {
  try {
    const category = new Category({
      ...req.body,

    });
    // User ko database me save karein
    await category.save();

    res.status(201).json({
      message: 'Employee created successfully',
      category,
    });

  } catch (error) {

    res.status(500).json({
      message: 'Error creating Employee',
      error: error.message,
    });
  }
});



// Define the cron job
cron.schedule('1 0 * * *', async () => {
  console.log("Cron job running at 12:01 AM...");
  try {
    const todayDate = new Date().toISOString().split('T')[0]; // Today's date in YYYY-MM-DD

    // Find employees whose attendance has not been marked for today
    const employeesWithAttendance = await EmployeeAttendance.find({ date: todayDate }).select('employeeId');
    const markedEmployeeIds = employeesWithAttendance.map(record => record.employeeId.toString());

    // Get all employees excluding those who already have attendance marked for today
    const employeesToMark = await Employee.find({ _id: { $nin: markedEmployeeIds } });

    if (employeesToMark.length === 0) {
      console.log("All employees already have attendance marked for today.");
      return;
    }

    // Prepare default attendance entries for these employees
    const attendanceEntries = employeesToMark.map(employee => ({
      employeeId: employee._id,
      date: todayDate,
      status: 'Absent', // Default status
      checkInTime: null, // No check-in by default
      checkOutTime: null, // No check-out by default
    }));

    // Insert the attendance entries into the EmployeeAttendance collection
    await EmployeeAttendance.insertMany(attendanceEntries);

    console.log(`Attendance marked for ${employeesToMark.length} employees for today.`);
  } catch (error) {
    console.error("Error in cron job:", error);
  }
});





Router.post('/employee-attendance', verifyToken, async (req, res) => {
  try {
    // Verify employee from the token
    const employeeData = jwt.verify(req.headers['authorization']?.split(' ')[1], 'Rahul HRM Software');

    // Get today's date in YYYY-MM-DD format
    const todayDate = new Date().toISOString().split('T')[0];

    // Check if an attendance record already exists for this employee and today's date
    const existingAttendance = await EmployeeAttendance.findOne({
      employeeId: employeeData._id,

      date: todayDate, // Assuming you save attendance records with a `date` field
    });

    if (existingAttendance) {
      return res.status(400).json({
        message: 'You have already marked your attendance for today.',
      });
    }

    // Create a new attendance record if no record exists for today
    const employeeAttendance = new EmployeeAttendance({
      ...req.body,
      employeeId: employeeData._id, // Reference employeeId from EmployeeSchema
      first_name: employeeData.first_name,
      last_name: employeeData.last_name,
      date: todayDate, // Set today's date
      checkOutTime: null,
    });

    // Save the new attendance record to the database
    await employeeAttendance.save();

    res.status(201).json({
      message: 'Attendance marked successfully',
      employeeAttendance,
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error creating Employee Attendance',
      error: error.message,
    });
  }
});


Router.patch("/employee-attendance", async (req, res) => {
  const { employeeId, date } = req.query; // Extract employeeId and date from query params
  const updates = req.body; // Extract the updates from the request body

  // Validate employeeId
  if (!employeeId) {
    return res.status(400).json({ message: "EmployeeId is required." });
  }

  try {
    // Default to today's date if no date is provided in the query
    const today = new Date().toISOString().split("T")[0];
    const normalizedDate = date ? new Date(date).toISOString().split("T")[0] : today;

    // Find and update the attendance record
    const attendance = await EmployeeAttendance.findOneAndUpdate(
      { employeeId, date: { $eq: normalizedDate } }, // Match by employeeId and normalized date
      { $set: updates }, // Dynamically update fields
      { new: true } // Return the updated document
    );

    // Handle case where no record is found
    if (!attendance) {
      return res.status(404).json({ message: `No attendance record found for date: ${normalizedDate}` });
    }

    // Respond with the updated record
    res.status(200).json({ message: "Attendance updated successfully.", attendance });
  } catch (error) {
    console.error("Error updating attendance:", error);
    res.status(500).json({ message: "Internal server error." });
  }
});


Router.get("/employee-attendance", verifyToken, async (req, res) => {
  const {
    employeeId, // Specific employee's attendance
    from, // Filter from date
    to, // Filter to date
    status, // Attendance status filter
    page = 1, // Page number for pagination
    limit = 10, // Records per page
    sortBy = "date", // Sort by field
    sortOrder = "asc" // Sort direction
  } = req.query;

  const { role } = req.user; // Extract role from token
  

  try {
    let filter = {};

    // Role-based filtering logic
    if (role === "employee") {
      filter.employeeId = req.user._id; // Only their own attendance
    } else if (role === "HR" || role === "admin") {
      // HR/Admin can fetch:
      // - All employees' attendance (if no employeeId is specified)
      // - Specific employee's attendance (if employeeId is specified)
      if (employeeId) {
        filter.employeeId = employeeId;
      }
    } else {
      return res.status(403).json({ message: "Unauthorized access." });
    }

    // Date range filtering
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);
      if (to) filter.date.$lte = new Date(to);
    }

    // Status filtering
    if (status && status !== "All") {
      filter.status = status;
    }

    const skip = (page - 1) * limit;

    // Fetch filtered attendance records with sorting and pagination
    const attendance = await EmployeeAttendance.find(filter)
      .sort({ [sortBy]: sortOrder === "asc" ? 1 : -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Count total records for pagination
    const totalRecords = await EmployeeAttendance.countDocuments(filter);

    return res.status(200).json({ attendance, totalRecords });
  } catch (error) {
    console.error("Error fetching attendance:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

Router.patch("/edit-employee/:id", async (req, res) => {
  const { id } = req.params; // Employee ID from the URL
  const updates = req.body; // Updates from the request body

  // Validate the ID
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid employee ID" });
  }

  // Check if there are updates
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: "No fields provided for update" });
  }

  try {
    // Update the employee using $set for partial and nested updates
    const updatedEmployee = await Employee.findByIdAndUpdate(
      id,
      { $set: updates }, // Use $set for partial updates
      { new: true, runValidators: true } // Return the updated document and validate inputs
    );

    if (!updatedEmployee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    res.status(200).json({
      message: "Employee updated successfully",
      employee: updatedEmployee,
    });
  } catch (error) {
    console.error("Error updating employee:", error);
    res.status(500).json({
      message: "Failed to update employee",
      error: error.message,
    });
  }
});

// Endpoint to get all employees
Router.get('/employee-list', verifyToken, async (req, res) => {
  try {
    const user = await Employee.find({ officialEmail: req.query.email });
   
    if (user.length === 0) {
      return res.status(500).json({ error: 'User not found' });
    }

    // Check if `simple` query parameter is provided
    const isSimple = req.query.simple === 'true';


    // Decide fields to return based on `simple` parameter
    const fields = isSimple
      ? { 'employee_id': 1, 'first_name': 1, 'last_name': 1, '_id': 1 }
      : {}; // Empty object to select all fields

    // Fetch employees with specified fields
    const employee = await Employee.find({}, fields);

    // If `simple` is true, transform the response for dropdown
    const transformedEmployees = isSimple
      ? employee.map(emp => ({
        _id: emp._id,
        employee_id: emp.employee_id,
        first_name: emp.first_name,
        last_name: emp.last_name,
      }))
      : employee; // Return the full data if `simple` is not set

    res.json(transformedEmployees);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching users' });
  }
});


Router.post('/login', async (req, res) => {
  try {
    // Check if email or phone exists in the request body
    const { emailOrPhone, password } = req.body;

    if (!emailOrPhone || !password) {
      return res.status(400).json({ error: 'Email/Phone and password are required' });
    }

    // Query to find user by email or phone number
    const user = await Employee.findOne({
      $or: [
        { officialEmail: emailOrPhone },
        { phone_number: emailOrPhone },
      ],
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Compare the provided password with the stored hash
    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        _id: user._id,
        company_name: user.company_name,
        email: user.officialEmail,
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone,
        photo_url: user.photo_url,
        photo_Id: user.photo_Id,
        designation: user.designation,
        role: user.role,
      },
      'Rahul HRM Software',
      { expiresIn: '365d' }
    );

    // Respond with user details and token
    res.status(200).json({
      _id: user._id,
      company_name: user.company_name,
      email: user.officialEmail,
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone,
      photo_url: user.photo_url,
      photo_Id: user.photo_Id,
      designation: user.designation,
      role: user.role,
      token: token,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: 'Error logging in',
      error: error.message,
    });
  }
});





Router.post('/add-employee', async (req, res) => {
  try {
    const files = req.files || {}; // Ensures `req.files` is defined

    // Helper function to upload file if exists
    const uploadFile = async (file) => {
      if (file && file.tempFilePath) {
        const upload = await cloudinary.uploader.upload(file.tempFilePath);
        return {
          secure_url: upload.secure_url,
          public_id: upload.public_id,
        };
      }
      return { secure_url: null, public_id: null }; // Return default values if file is missing
    };

    const uploadProfilePic = await uploadFile(files.profilePic);
    const uploadAadhaar = await uploadFile(files.aadhaar);
    const uploadPanCard = await uploadFile(files.panCard);
    const uploadResume = await uploadFile(files.resume);
    const uploadOfferLetter = await uploadFile(files.offerLetter);
    const uploadEducationDoccument = await uploadFile(files.educationDoccument);

    const employee = new Employee({
      ...req.body,
      photo_url: uploadProfilePic.secure_url,
      photo_Id: uploadProfilePic.public_id,
      documents: {
        aadhaarUrl: uploadAadhaar.secure_url,
        aadhaar_id: uploadAadhaar.public_id,
        panUrl: uploadPanCard.secure_url,
        pan_id: uploadPanCard.public_id,
        resumeUrl: uploadResume.secure_url,
        resume_id: uploadResume.public_id,
        offer_letter_id: uploadOfferLetter.public_id,
        offer_letterUrl: uploadOfferLetter.secure_url,
        educationDoccumentUrl: uploadEducationDoccument.secure_url,
        educationDoccument_id: uploadEducationDoccument.public_id
      }
    });


    // User ko database me save karein
    await employee.save();

    res.status(201).json({
      message: 'Employee created successfully',
      employee,
    });

  } catch (error) {

    res.status(500).json({
      message: 'Error creating Employee',
      error: error.message,
    });
  }
});



module.exports = Router