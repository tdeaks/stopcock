pub(super) struct Reader<'a> {
    bytes: &'a [u8],
    offset: usize,
}

impl<'a> Reader<'a> {
    pub(super) fn new(bytes: &'a [u8]) -> Self {
        Self { bytes, offset: 0 }
    }

    pub(super) fn expect_magic(&mut self, magic: &[u8]) -> Option<()> {
        let value = self.take(magic.len())?;
        if value == magic {
            Some(())
        } else {
            None
        }
    }

    pub(super) fn is_done(&self) -> bool {
        self.offset == self.bytes.len()
    }

    fn take(&mut self, len: usize) -> Option<&'a [u8]> {
        let end = self.offset.checked_add(len)?;
        let value = self.bytes.get(self.offset..end)?;
        self.offset = end;
        Some(value)
    }

    pub(super) fn u8(&mut self) -> Option<u8> {
        Some(*self.take(1)?.first()?)
    }

    pub(super) fn bool(&mut self) -> Option<bool> {
        match self.u8()? {
            0 => Some(false),
            1 => Some(true),
            _ => None,
        }
    }

    pub(super) fn u16(&mut self) -> Option<u16> {
        Some(u16::from_le_bytes(self.take(2)?.try_into().ok()?))
    }

    pub(super) fn u32(&mut self) -> Option<u32> {
        Some(u32::from_le_bytes(self.take(4)?.try_into().ok()?))
    }

    pub(super) fn usize(&mut self) -> Option<usize> {
        usize::try_from(self.u32()?).ok()
    }

    pub(super) fn f32(&mut self) -> Option<f32> {
        Some(f32::from_le_bytes(self.take(4)?.try_into().ok()?))
    }

    pub(super) fn f64(&mut self) -> Option<f64> {
        Some(f64::from_le_bytes(self.take(8)?.try_into().ok()?))
    }

    pub(super) fn vec<T>(
        &mut self,
        mut decode: impl FnMut(&mut Self) -> Option<T>,
    ) -> Option<Vec<T>> {
        let len = self.usize()?;
        let mut values = Vec::with_capacity(len);
        for _ in 0..len {
            values.push(decode(self)?);
        }
        Some(values)
    }

    pub(super) fn f32_vec(&mut self) -> Option<Vec<f32>> {
        self.vec(|r| r.f32())
    }

    pub(super) fn f64_vec(&mut self) -> Option<Vec<f64>> {
        self.vec(|r| r.f64())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_little_endian_scalars_and_rejects_trailing_overread() {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(b"SYN1");
        bytes.push(1);
        bytes.extend_from_slice(&2_u16.to_le_bytes());
        bytes.extend_from_slice(&3_u32.to_le_bytes());
        bytes.extend_from_slice(&4.5_f32.to_le_bytes());
        bytes.extend_from_slice(&6.25_f64.to_le_bytes());
        let mut reader = Reader::new(&bytes);

        assert_eq!(reader.expect_magic(b"SYN1"), Some(()));
        assert_eq!(reader.u8(), Some(1));
        assert_eq!(reader.u16(), Some(2));
        assert_eq!(reader.usize(), Some(3));
        assert_eq!(reader.f32(), Some(4.5));
        assert_eq!(reader.f64(), Some(6.25));
        assert!(reader.is_done());
        assert_eq!(reader.u8(), None);
    }

    #[test]
    fn vec_rolls_forward_only_after_successful_items() {
        let bytes = [
            2, 0, 0, 0, // len
            1, 0, 0, 0, // item 1
            2, 0, 0, 0, // item 2
        ];
        let mut reader = Reader::new(&bytes);
        assert_eq!(reader.vec(|r| r.usize()), Some(vec![1, 2]));
        assert!(reader.is_done());

        let mut truncated = Reader::new(&bytes[..7]);
        assert_eq!(truncated.vec(|r| r.usize()), None);
    }

    #[test]
    fn bool_accepts_only_binary_values() {
        assert_eq!(Reader::new(&[0]).bool(), Some(false));
        assert_eq!(Reader::new(&[1]).bool(), Some(true));
        assert_eq!(Reader::new(&[2]).bool(), None);
    }
}
