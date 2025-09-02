// Add this code to the existing assignment endpoint

// After successfully updating the customer's assignees
await AssignmentHistory.create({
    customer: customerId,
    assignedBy: session.user.id,
    assignedTo: staffId,
    notes: notes || "Phân bổ thường xuyên"
});
