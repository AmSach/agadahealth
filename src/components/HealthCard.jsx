import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';

export default function HealthCard({ profile, onSaveProfile }) {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    bloodGroup: '',
    allergies: '',
    chronicConditions: '',
    emergencyName: '',
    emergencyPhone: ''
  });
  const [qrUrl, setQrUrl] = useState('');
  const [showQrModal, setShowQrModal] = useState(false);

  useEffect(() => {
    if (profile) {
      setFormData({
        name: profile.name || '',
        bloodGroup: profile.bloodGroup || '',
        allergies: profile.allergies || '',
        chronicConditions: profile.chronicConditions || '',
        emergencyName: profile.emergencyName || '',
        emergencyPhone: profile.emergencyPhone || ''
      });
    }
  }, [profile]);

  useEffect(() => {
    // Generate emergency QR payload (JSON subset for quick emergency scans)
    const qrPayload = JSON.stringify({
      n: formData.name,
      b: formData.bloodGroup,
      a: formData.allergies,
      c: formData.chronicConditions,
      en: formData.emergencyName,
      ep: formData.emergencyPhone,
      app: "Agada Medicine OS"
    });

    QRCode.toDataURL(
      qrPayload,
      {
        errorCorrectionLevel: 'M',
        margin: 2,
        color: {
          dark: '#1e293b', // slate-800
          light: '#f8fafc' // slate-50
        }
      },
      (err, url) => {
        if (!err) {
          setQrUrl(url);
        } else {
          console.error("QR Code generation error:", err);
        }
      }
    );
  }, [formData]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (onSaveProfile) {
      onSaveProfile(formData);
    }
    setIsEditing(false);
  };

  return (
    <div className="health-card-container">
      <div className="health-card-header">
        <h3>📋 Digital Emergency Health Card</h3>
        <p className="card-subtitle">Offline scannable card for doctors & first responders</p>
      </div>

      <div className="health-card-body">
        {!isEditing ? (
          <div className="glass-card health-display-card">
            <div className="card-top-accent"></div>
            <div className="health-card-main-info">
              <div className="info-row name-section">
                <span className="info-label">PATIENT NAME</span>
                <span className="info-val highlight-text">{formData.name || 'Not Set'}</span>
              </div>
              <div className="info-grid">
                <div className="info-cell">
                  <span className="info-label">BLOOD GROUP</span>
                  <span className="info-val blood-badge">{formData.bloodGroup || 'N/A'}</span>
                </div>
                <div className="info-cell">
                  <span className="info-label">ALLERGIES</span>
                  <span className="info-val alert-badge">{formData.allergies || 'None Logged'}</span>
                </div>
              </div>
              
              <div className="info-row">
                <span className="info-label">CHRONIC CONDITIONS</span>
                <span className="info-val">{formData.chronicConditions || 'None Logged'}</span>
              </div>

              <div className="emergency-contact-box">
                <span className="info-label">EMERGENCY CONTACT</span>
                <div className="contact-details">
                  <span className="contact-name">{formData.emergencyName || 'None'}</span>
                  <span className="contact-phone">{formData.emergencyPhone || ''}</span>
                </div>
              </div>
            </div>

            <div className="health-card-qr-side">
              {qrUrl ? (
                <div className="qr-preview-box" onClick={() => setShowQrModal(true)}>
                  <img src={qrUrl} alt="Emergency QR Code" className="qr-img" />
                  <span className="qr-caption">🔍 Tap to enlarge</span>
                </div>
              ) : (
                <div className="qr-loading">Generating Offline QR...</div>
              )}
            </div>

            <div className="card-action-bar">
              <button className="btn-secondary" onClick={() => setIsEditing(true)}>
                ✏️ Edit Profile Card
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="health-card-form glass-card">
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="card-name">Full Name</label>
                <input
                  id="card-name"
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="e.g. Aman Sachan"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="card-blood">Blood Group</label>
                <select
                  id="card-blood"
                  name="bloodGroup"
                  value={formData.bloodGroup}
                  onChange={handleInputChange}
                >
                  <option value="">Select blood group...</option>
                  <option value="A+">A+</option>
                  <option value="A-">A-</option>
                  <option value="B+">B+</option>
                  <option value="B-">B-</option>
                  <option value="AB+">AB+</option>
                  <option value="AB-">AB-</option>
                  <option value="O+">O+</option>
                  <option value="O-">O-</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="card-allergies">Allergies</label>
                <input
                  id="card-allergies"
                  type="text"
                  name="allergies"
                  value={formData.allergies}
                  onChange={handleInputChange}
                  placeholder="e.g. Penicillin, Peanuts"
                />
              </div>

              <div className="form-group">
                <label htmlFor="card-chronic">Chronic Conditions</label>
                <input
                  id="card-chronic"
                  type="text"
                  name="chronicConditions"
                  value={formData.chronicConditions}
                  onChange={handleInputChange}
                  placeholder="e.g. Hypertension, Diabetes"
                />
              </div>

              <div className="form-group">
                <label htmlFor="card-em-name">Emergency Contact Name</label>
                <input
                  id="card-em-name"
                  type="text"
                  name="emergencyName"
                  value={formData.emergencyName}
                  onChange={handleInputChange}
                  placeholder="e.g. Spouse/Parent Name"
                />
              </div>

              <div className="form-group">
                <label htmlFor="card-em-phone">Emergency Phone</label>
                <input
                  id="card-em-phone"
                  type="tel"
                  name="emergencyPhone"
                  value={formData.emergencyPhone}
                  onChange={handleInputChange}
                  placeholder="e.g. +91 98765 43210"
                />
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="btn-primary">💾 Save Card</button>
              <button type="button" className="btn-tertiary" onClick={() => setIsEditing(false)}>Cancel</button>
            </div>
          </form>
        )}
      </div>

      {showQrModal && (
        <div className="modal-overlay" onClick={() => setShowQrModal(false)}>
          <div className="modal-content qr-large-modal" onClick={e => e.stopPropagation()}>
            <h4>Medical Emergency QR Card</h4>
            <p>Scan in case of emergency for blood group, allergies, and contact info.</p>
            <div className="large-qr-wrapper">
              <img src={qrUrl} alt="Emergency QR Code" />
            </div>
            <div className="qr-card-data-summary">
              <p><strong>Name:</strong> {formData.name || 'N/A'}</p>
              <p><strong>Blood Group:</strong> {formData.bloodGroup || 'N/A'}</p>
              <p><strong>Allergies:</strong> {formData.allergies || 'None logged'}</p>
              <p><strong>Emergency Contact:</strong> {formData.emergencyName} ({formData.emergencyPhone})</p>
            </div>
            <button className="btn-primary" onClick={() => setShowQrModal(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
