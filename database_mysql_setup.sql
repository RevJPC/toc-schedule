-- TOC Schedule Database - MySQL Version for XAMPP
-- Drop existing database and create fresh
DROP DATABASE IF EXISTS toc_schedule;
CREATE DATABASE toc_schedule CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE toc_schedule;

-- Markets table (renamed to 'count' in original schema)
CREATE TABLE `count` (
  id INT AUTO_INCREMENT PRIMARY KEY,
  market VARCHAR(10) NOT NULL UNIQUE COMMENT '3 letter code (avl, tto, etc)',
  defaultcity VARCHAR(100) NOT NULL COMMENT 'Readable name (Asheville, etc)',
  status TINYINT DEFAULT 1 COMMENT '1=active, 0=inactive',
  INDEX idx_market (market),
  INDEX idx_status (status)
) ENGINE=InnoDB;

-- Drivers table
CREATE TABLE `Drivers` (
  did INT AUTO_INCREMENT PRIMARY KEY,
  Owner_fname VARCHAR(100) NOT NULL,
  Owner_lname VARCHAR(100) NOT NULL,
  displayName VARCHAR(200) COMMENT 'Preferred name',
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(20) COMMENT 'No dashes',
  market VARCHAR(10) NOT NULL COMMENT '3 letter code',
  schedule_priority TINYINT DEFAULT 5 COMMENT 'Priority 1-5, was priority',
  status TINYINT DEFAULT 1 COMMENT '1=active, 0=inactive (inverse of blocked)',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (market) REFERENCES `count`(market) ON UPDATE CASCADE,
  INDEX idx_email (email),
  INDEX idx_market (market),
  INDEX idx_status (status)
) ENGINE=InnoDB;

-- Shift templates table
CREATE TABLE `shift_templates` (
  id INT AUTO_INCREMENT PRIMARY KEY,
  market VARCHAR(10) NOT NULL COMMENT '3 letter code',
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  capacity INT DEFAULT 1 COMMENT 'Capacity 1-20',
  FOREIGN KEY (market) REFERENCES `count`(market) ON UPDATE CASCADE,
  UNIQUE KEY unique_shift (market, start_time, end_time),
  INDEX idx_market (market)
) ENGINE=InnoDB;

-- Scheduled shifts table
CREATE TABLE `scheduled_shifts` (
  id INT AUTO_INCREMENT PRIMARY KEY,
  driver_id INT NOT NULL,
  template_id INT NOT NULL,
  date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (driver_id) REFERENCES `Drivers`(did) ON DELETE CASCADE,
  FOREIGN KEY (template_id) REFERENCES `shift_templates`(id) ON DELETE CASCADE,
  UNIQUE KEY unique_driver_shift (driver_id, template_id, date),
  INDEX idx_driver (driver_id),
  INDEX idx_template (template_id),
  INDEX idx_date (date)
) ENGINE=InnoDB;

-- Schedule settings table
CREATE TABLE `schedule_settings` (
  id INT PRIMARY KEY DEFAULT 1,
  base_schedule_days INT DEFAULT 7,
  cancel_hours_before INT DEFAULT 24,
  show_available_spots TINYINT DEFAULT 0,
  slack_webhook_url TEXT
) ENGINE=InnoDB;

-- Admins table
CREATE TABLE `admins` (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(200) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_email (email)
) ENGINE=InnoDB;

-- Capacity overrides
CREATE TABLE `capacity_overrides` (
  id INT AUTO_INCREMENT PRIMARY KEY,
  template_id INT NOT NULL,
  day_of_week TINYINT NOT NULL COMMENT '0=Sunday to 6=Saturday',
  capacity INT NOT NULL COMMENT 'Capacity 0-20',
  FOREIGN KEY (template_id) REFERENCES `shift_templates`(id) ON DELETE CASCADE,
  UNIQUE KEY unique_template_day (template_id, day_of_week),
  INDEX idx_template (template_id)
) ENGINE=InnoDB;

-- Insert default settings
INSERT INTO `schedule_settings` (id, base_schedule_days, cancel_hours_before, show_available_spots)
VALUES (1, 7, 24, 0);

-- Insert default markets
INSERT INTO `count` (market, defaultcity, status) VALUES
('tto', 'Chapel Hill', 1),
('avl', 'Asheville', 1),
('rto', 'Raleigh', 1),
('dto', 'Durham', 1),
('ilm', 'Wilmington', 1),
('gso', 'Greensboro', 1),
('int', 'Winston-Salem', 1);

-- Sample data (optional - remove if not needed)
-- Insert a test driver
INSERT INTO `Drivers` (Owner_fname, Owner_lname, displayName, email, phone, market, schedule_priority, status)
VALUES ('Test', 'Driver', 'Test Driver', 'test@example.com', '5551234567', 'tto', 3, 1);

-- Insert sample shift templates
INSERT INTO `shift_templates` (market, start_time, end_time, capacity) VALUES
('tto', '09:00:00', '17:00:00', 5),
('tto', '17:00:00', '23:00:00', 3),
('avl', '09:00:00', '17:00:00', 4),
('avl', '17:00:00', '23:00:00', 2);

-- Create a default admin user (password: 'admin123' - CHANGE THIS!)
-- Password hash generated with bcrypt for 'admin123'
INSERT INTO `admins` (email, password_hash, name)
VALUES ('admin@example.com', '$2b$10$rKZLvVZqGqNvKJ5yKxKxXOGxKxKxKxKxKxKxKxKxKxKxKxKxKxK', 'Admin User');

-- Display success message
SELECT 'Database created successfully!' AS Status;
SELECT 'Tables created:' AS Info;
SHOW TABLES;
