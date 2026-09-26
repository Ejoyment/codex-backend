import { useState } from 'react';
import { X } from 'lucide-react';
import { projectApi } from '../lib/api';

export default function CreateTaskModal({ onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [taskType, setTaskType] = useState('local');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    setSubmitting(true);
    setError(null);
    try {
      const result = await projectApi.createTask({
        title: trimmedTitle,
        description: description.trim(),
        priority,
        taskType,
      });
      if (result.success !== false) {
        onCreated?.(result.task);
        onClose();
      } else {
        setError(result.message || 'Failed to create task');
      }
    } catch (err) {
      setError(err.message || 'Failed to create task. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999] p-4" onClick={onClose}>
      <div
        className="ws-modal p-8 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h3 className="ws-modal-title">Create New Task</h3>
          <button type="button" onClick={onClose} className="text-[#565d6b] hover:text-[#eceef1] text-2xl leading-none">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="ws-label">Task Title *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Implement feature XYZ"
              className="ws-input"
            />
          </div>
          <div className="mb-4">
            <label className="ws-label">Description</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Task details"
              className="ws-input resize-y"
            />
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="ws-label">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="ws-select"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="ws-label">Task Type</label>
              <select
                value={taskType}
                onChange={(e) => setTaskType(e.target.value)}
                className="ws-select"
              >
                <option value="local">Local BuildrsHQ</option>
                <option value="github">GitHub Issue</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3 justify-end mt-6">
            <button
              type="button"
              onClick={onClose}
              className="btn-workspace btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 border-none rounded-lg bg-blue-500 text-white text-sm font-semibold disabled:opacity-60"
            >
              {submitting ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
