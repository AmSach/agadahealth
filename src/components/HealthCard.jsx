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
    // Generate emergency QR payload (Formatted plain-text for universal scanner readability)
    const qrPayload = `--- AGADA EMERGENCY MEDICAL ID ---
Patient: ${formData.name || 'Not Specified'}
Blood Group: ${formData.bloodGroup || 'N/A'}
Allergies: ${formData.allergies || 'None Logged'}
Chronic Conditions: ${formData.chronicConditions || 'None Logged'}
Emergency Contact: ${formData.emergencyName || 'Not Set'} ${formData.emergencyPhone ? `(${formData.emergencyPhone})` : ''}
---------------------------------
Zero-Knowledge Offline Medical Pass`;

    QRCode.toDataURL(
      qrPayload,
      {
        errorCorrectionLevel: 'H',
        margin: 4,
        width: 300,
        color: {
          dark: '#000000', // pure black
          light: '#ffffff' // pure white
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

      <div className="health-card-body" style={{ animation: 'fadeUp 0.4s ease' }}>
        {!isEditing ? (
          <div>
            <div className="emergency-wallet-card">
              <div className="wallet-card-overlay"></div>
              <div className="wallet-header">
                <span className="wallet-logo">
                  <span className="wallet-logo-icon"></span>
                  MEDICAL EMERGENCY CARD
                </span>
                <span className="wallet-type">OFFLINE VAULT</span>
              </div>

              <div className="wallet-body">
                <div className="wallet-info-side">
                  <div className="wallet-field">
                    <span className="wallet-label">PATIENT NAME</span>
                    <span className="wallet-value highlight">{formData.name || 'NOT SET'}</span>
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div className="wallet-field">
                      <span className="wallet-label">BLOOD TYPE</span>
                      <div>
                        <span className="wallet-blood-badge">{formData.bloodGroup || 'N/A'}</span>
                      </div>
                    </div>
                    <div className="wallet-field">
                      <span className="wallet-label">ALLERGIES</span>
                      <div>
                        <span className="wallet-allergies-badge" style={{ backgroundColor: formData.allergies ? '#E11D48' : '#64748B' }}>
                          {formData.allergies || 'None Logged'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="wallet-field">
                    <span className="wallet-label">CHRONIC CONDITIONS</span>
                    <span className="wallet-value" style={{ fontSize: '12.5px' }}>{formData.chronicConditions || 'None Logged'}</span>
                  </div>
                </div>

                <div className="wallet-qr-side">
                  {qrUrl ? (
                    <div className="wallet-qr-box" onClick={() => setShowQrModal(true)}>
                      <img src={qrUrl} alt="Emergency QR Code" className="wallet-qr-img" />
                    </div>
                  ) : (
                    <div style={{ fontSize: '10px', color: '#94a3b8' }}>Generating QR...</div>
                  )}
                  <span className="wallet-qr-caption">🔍 Tap to expand</span>
                </div>
              </div>

              <div className="wallet-footer">
                <div className="wallet-field">
                  <span className="wallet-label">EMERGENCY CONTACT</span>
                  <span className="wallet-contact-name">{formData.emergencyName || 'NOT SET'}</span>
                </div>
                {formData.emergencyPhone && (
                  <div className="wallet-field" style={{ alignItems: 'flex-end' }}>
                    <span className="wallet-label">CALL PHONE</span>
                    <span className="wallet-contact-phone">{formData.emergencyPhone}</span>
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '14px' }}>
              <button className="btn-secondary" onClick={() => setIsEditing(true)}>
                ✏️ Edit Emergency Card
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="health-card-form glass-card">
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--navy)', marginBottom: '4px' }}>
              ✏️ Edit Emergency Profile Card
            </div>
            <p style={{ fontSize: '12px', color: 'var(--textlt)', marginBottom: '10px' }}>
              All medical information is saved privately on your device.
            </p>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="card-name">👤 Full Name</label>
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
                <label htmlFor="card-blood">🩸 Blood Group</label>
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
                <label htmlFor="card-allergies">⚠️ Allergies (medications or foods)</label>
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
                <label htmlFor="card-chronic">🩺 Chronic Conditions</label>
                <input
                  id="card-chronic"
                  type="text"
                  name="chronicConditions"
                  value={formData.chronicConditions}
                  onChange={handleInputChange}
                  placeholder="e.g. Asthma, Diabetes"
                />
              </div>

              <div className="form-group">
                <label htmlFor="card-em-name">📞 Emergency Contact Name</label>
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
                <label htmlFor="card-em-phone">📱 Emergency Phone</label>
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
            <h4 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--navy)', marginBottom: '8px' }}>
              🚨 Emergency Responder QR Card
            </h4>
            <p style={{ fontSize: '12px', color: 'var(--textlt)', marginBottom: '16px' }}>
              First responders can scan this to read your critical medical profiles offline.
            </p>
            <div className="large-qr-wrapper" style={{ 
              boxShadow: 'var(--shadowmd)',
              background: '#ffffff',
              padding: '16px',
              borderRadius: '16px',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              margin: '0 auto 16px',
              width: '260px',
              height: '260px'
            }}>
              <img 
                src={qrUrl} 
                alt="Emergency QR Code" 
                style={{ 
                  display: 'block', 
                  width: '100%', 
                  height: '100%', 
                  objectFit: 'contain',
                  imageRendering: 'pixelated'
                }} 
              />
            </div>
            <div className="qr-card-data-summary" style={{ boxShadow: 'var(--shadow)' }}>
              <p><strong>👤 Name:</strong> {formData.name || 'N/A'}</p>
              <p><strong>🩸 Blood Group:</strong> {formData.bloodGroup || 'N/A'}</p>
              <p><strong>⚠️ Allergies:</strong> {formData.allergies || 'None logged'}</p>
              <p><strong>🩺 Conditions:</strong> {formData.chronicConditions || 'None logged'}</p>
              <p><strong>📞 Emergency Contact:</strong> {formData.emergencyName} ({formData.emergencyPhone})</p>
            </div>
            <button className="btn-primary" style={{ width: '100%' }} onClick={() => setShowQrModal(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
