const mongoose = require('mongoose');

const groupReliabilityEventSchema = new mongoose.Schema({
  group_id: {
    type: String,
    required: true,
    index: true
  },
  group_name: {
    type: String,
    default: null
  },
  faculty: String,
  program: String,
  course: Number,

  delta: {
    type: Number,
    required: true
  },
  reason: {
    type: String,
    default: ''
  },
  source: {
    type: String,
    enum: ['teacher', 'admin', 'system'],
    default: 'system'
  },
  actor_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  evidence_url: {
    type: String,
    default: null
  },

  created_at: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('GroupReliabilityEvent', groupReliabilityEventSchema);
