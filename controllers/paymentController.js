
export function createQrPayment(req, res) {
  return res.status(501).json({
    message: "QR Ph payment integration is not configured yet."
  });
}

export function checkQrPayment(req, res) {
  return res.status(501).json({
    message: "QR Ph payment status checking is not configured yet.",
    paymentIntentId: req.params.paymentIntentId
  });
}
