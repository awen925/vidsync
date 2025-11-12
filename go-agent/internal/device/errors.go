package device

import "errors"

var (
	ErrNoDevice      = errors.New("no device found")
	ErrInvalidDevice = errors.New("invalid device")
)
